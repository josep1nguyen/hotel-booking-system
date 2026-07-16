const Booking = require("../models/Booking");
const { getRoomById } = require("../services/roomServiceClient");
const { chargePayment } = require("../services/paymentServiceClient");
const { publishEvent } = require("../config/rabbitmq");

const CANCEL_POLICY_HOURS = 24;
const PENDING_PAYMENT_TIMEOUT_MINUTES = 15;

function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut) - new Date(checkIn);
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// Kiểm tra overlap: booking mới [checkIn, checkOut) có giao với booking đã tồn tại không.
// Điều kiện overlap kinh điển: existing.checkIn < new.checkOut AND existing.checkOut > new.checkIn
async function hasOverlap(roomId, checkIn, checkOut, excludeBookingId = null) {
  const query = {
    roomId,
    status: { $in: ["PENDING_PAYMENT", "CONFIRMED"] },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };
  const conflict = await Booking.findOne(query);
  return !!conflict;
}

// FR-04: Đặt phòng
async function createBooking(req, res) {
  try {
    const { roomId, checkIn, checkOut } = req.body;
    const guestId = req.user.userId;

    if (!roomId || !checkIn || !checkOut) {
      return res.status(400).json({ message: "Thiếu roomId, checkIn hoặc checkOut" });
    }
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    if (isNaN(inDate) || isNaN(outDate) || inDate >= outDate) {
      return res.status(400).json({ message: "Ngày check-in phải trước ngày check-out" });
    }
    if (inDate < new Date()) {
      return res.status(400).json({ message: "Ngày check-in không thể ở quá khứ" });
    }

    // Gọi sang Room Service để lấy thông tin phòng (đồng bộ - REST)
    const room = await getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }
    if (room.status !== "active") {
      return res.status(409).json({ message: "Phòng hiện không khả dụng để đặt" });
    }

    // E1: Phòng vừa bị đặt bởi người khác (race condition) -> kiểm tra ngay trước khi tạo
    const conflict = await hasOverlap(roomId, inDate, outDate);
    if (conflict) {
      return res.status(409).json({
        message: "Phòng đã được đặt trong khung thời gian này, vui lòng chọn phòng hoặc thời gian khác",
      });
    }

    const nights = nightsBetween(inDate, outDate);
    const totalPrice = nights * room.pricePerNight;

    const booking = await Booking.create({
      guestId,
      roomId,
      roomNumber: room.roomNumber,
      roomType: room.type,
      checkIn: inDate,
      checkOut: outDate,
      pricePerNight: room.pricePerNight,
      totalPrice,
      status: "PENDING_PAYMENT",
    });

    // Gọi Payment Service ĐỒNG BỘ (REST) - đúng luồng Sequence Diagram FR-04.
    let paymentResult;
    try {
      paymentResult = await chargePayment({ bookingId: booking._id.toString(), guestId, amount: totalPrice });
    } catch (paymentErr) {
      // Payment Service không phản hồi sau khi retry -> giữ booking ở PENDING_PAYMENT,
      // để autoCancelJob tự dọn dẹp sau 15 phút nếu vẫn không xử lý được (ràng buộc Phần 1.3).
      console.error(`[booking-service] ${paymentErr.message}`);
      return res.status(202).json({
        message:
          "Đã tạo booking, nhưng hệ thống thanh toán tạm thời không phản hồi. Booking đang ở trạng thái chờ và sẽ tự động hủy nếu không thanh toán được trong 15 phút.",
        booking,
      });
    }

    if (paymentResult.status === "SUCCESS") {
      booking.status = "CONFIRMED";
      await booking.save();

      publishEvent("booking.confirmed", {
        bookingId: booking._id.toString(),
        guestId,
        roomNumber: booking.roomNumber,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalPrice: booking.totalPrice,
      });

      return res.status(201).json({
        message: "Đặt phòng thành công",
        booking,
        payment: paymentResult,
      });
    }

    // E2 (FR-04): Thanh toán thất bại -> booking chuyển CANCELLED
    booking.status = "CANCELLED";
    booking.cancelReason = `Thanh toán thất bại: ${paymentResult.reason || "không rõ lý do"}`;
    await booking.save();

    publishEvent("payment.failed", {
      bookingId: booking._id.toString(),
      guestId,
      roomNumber: booking.roomNumber,
      reason: paymentResult.reason,
    });

    return res.status(402).json({
      message: "Thanh toán thất bại, booking đã bị hủy. Vui lòng thử đặt lại.",
      booking,
      payment: paymentResult,
    });
  } catch (err) {
    console.error(err);
    const msg = err.message === "Không thể kết nối tới Room Service"
      ? "Không thể xác thực thông tin phòng lúc này, vui lòng thử lại"
      : "Lỗi hệ thống, vui lòng thử lại";
    return res.status(err.message === "Không thể kết nối tới Room Service" ? 503 : 500).json({ message: msg });
  }
}

// FR-06: Hủy đặt phòng
async function cancelBooking(req, res) {
  try {
    const { id } = req.params;
    const guestId = req.user.userId;
    const isAdmin = req.user.role === "admin";

    const booking = await Booking.findById(id);
    // E2: Booking không tồn tại hoặc không thuộc về Guest
    if (!booking) {
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }
    if (!isAdmin && booking.guestId !== String(guestId)) {
      return res.status(403).json({ message: "Booking này không thuộc về bạn" });
    }
    if (booking.status === "CANCELLED") {
      return res.status(400).json({ message: "Booking đã được hủy trước đó" });
    }

    // E1: Quá thời hạn cho phép hủy (Admin được bỏ qua ràng buộc này khi xử lý thủ công)
    const hoursUntilCheckIn = (new Date(booking.checkIn) - new Date()) / (1000 * 60 * 60);
    if (!isAdmin && hoursUntilCheckIn < CANCEL_POLICY_HOURS) {
      return res.status(403).json({
        message: `Chỉ được hủy trước tối thiểu ${CANCEL_POLICY_HOURS} giờ so với check-in`,
      });
    }

    booking.status = "CANCELLED";
    booking.cancelReason = isAdmin ? "Hủy bởi Admin" : "Hủy bởi Guest";
    await booking.save();

    // Publish bất đồng bộ - Guest không cần chờ Payment Service xử lý hoàn tiền xong mới
    // nhận response (đúng luồng trong Sequence Diagram FR-06).
    publishEvent("booking.cancelled", {
      bookingId: booking._id.toString(),
      guestId: booking.guestId,
      roomNumber: booking.roomNumber,
      totalPrice: booking.totalPrice,
    });

    return res.status(200).json({ message: "Hủy đặt phòng thành công", booking });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại" });
  }
}

// FR-07: Xem lịch sử đặt phòng (của chính Guest đang đăng nhập)
async function myBookings(req, res) {
  try {
    const bookings = await Booking.find({ guestId: req.user.userId }).sort({ createdAt: -1 });
    return res.status(200).json({ count: bookings.length, bookings });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

async function getBookingById(req, res) {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Không tìm thấy booking" });
    const isAdmin = req.user.role === "admin";
    if (!isAdmin && booking.guestId !== String(req.user.userId)) {
      return res.status(403).json({ message: "Booking này không thuộc về bạn" });
    }
    return res.status(200).json({ booking });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

// FR-09: Quản lý đặt phòng (Admin)
async function adminListAll(req, res) {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ count: bookings.length, bookings });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

async function adminUpdateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!["PENDING_PAYMENT", "CONFIRMED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Không tìm thấy booking" });

    // E1 (FR-09): Thao tác trên booking đã CANCELLED -> từ chối chỉnh sửa
    if (booking.status === "CANCELLED") {
      return res.status(400).json({ message: "Booking đã bị hủy, không thể chỉnh sửa" });
    }

    booking.status = status;
    await booking.save();
    return res.status(200).json({ message: "Cập nhật trạng thái booking thành công", booking });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

module.exports = {
  createBooking,
  cancelBooking,
  myBookings,
  getBookingById,
  adminListAll,
  adminUpdateStatus,
  PENDING_PAYMENT_TIMEOUT_MINUTES,
};
