const Room = require("../models/Room");

// FR-03: Tìm kiếm phòng trống
// Lưu ý kiến trúc: Room Service chỉ biết trạng thái "active/maintenance/inactive" của phòng
// (không sở hữu dữ liệu booking, tuân thủ Database per Service).
// Việc loại các phòng đã có booking trùng khung thời gian (overlap theo checkIn/checkOut)
// sẽ được Booking Service đảm nhiệm ở Day 4, bằng cách: gọi endpoint này để lấy danh sách
// phòng active theo bộ lọc, sau đó đối chiếu với Booking DB của chính nó để loại phòng đã đặt.
async function searchRooms(req, res) {
  try {
    const { checkIn, checkOut, type, minPrice, maxPrice } = req.query;

    // E2: Ngày check-in >= check-out
    if (checkIn && checkOut) {
      const inDate = new Date(checkIn);
      const outDate = new Date(checkOut);
      if (isNaN(inDate) || isNaN(outDate) || inDate >= outDate) {
        return res.status(400).json({ message: "Ngày check-in phải trước ngày check-out" });
      }
    }

    const filter = { status: "active" };
    if (type) filter.type = type;
    if (minPrice || maxPrice) {
      filter.pricePerNight = {};
      if (minPrice) filter.pricePerNight.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerNight.$lte = Number(maxPrice);
    }

    const rooms = await Room.find(filter).sort({ pricePerNight: 1 });

    // E1: Không có phòng phù hợp -> vẫn trả 200 kèm danh sách rỗng, để client tự xử lý gợi ý
    return res.status(200).json({ count: rooms.length, rooms });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại" });
  }
}

async function getRoomById(req, res) {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    return res.status(200).json({ room });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

// FR-08: Quản lý phòng (CRUD) - chỉ Admin
async function createRoom(req, res) {
  try {
    const { roomNumber, type, pricePerNight, capacity, description, amenities } = req.body;
    if (!roomNumber || !type || pricePerNight == null || !capacity) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }
    const existing = await Room.findOne({ roomNumber });
    if (existing) {
      return res.status(409).json({ message: "Số phòng đã tồn tại" });
    }
    const room = await Room.create({ roomNumber, type, pricePerNight, capacity, description, amenities });
    return res.status(201).json({ message: "Tạo phòng thành công", room });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại" });
  }
}

async function updateRoom(req, res) {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    return res.status(200).json({ message: "Cập nhật phòng thành công", room });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại" });
  }
}

// E1 (FR-08): Xóa phòng đang có booking hiệu lực -> hệ thống từ chối.
// Ràng buộc này phụ thuộc dữ liệu Booking (thuộc Booking Service), nên tại Day 3 Room Service
// mới chỉ hỗ trợ soft-delete (chuyển status = inactive). Việc kiểm tra "còn booking hiệu lực hay
// không" trước khi cho phép xoá cứng sẽ được Booking Service gọi ngược lại xác nhận ở Day 4/5.
async function deleteRoom(req, res) {
  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { status: "inactive" },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    return res.status(200).json({ message: "Đã ngừng kinh doanh phòng (soft-delete)", room });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

async function listAllRoomsAdmin(req, res) {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    return res.status(200).json({ count: rooms.length, rooms });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

module.exports = {
  searchRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  listAllRoomsAdmin,
};
