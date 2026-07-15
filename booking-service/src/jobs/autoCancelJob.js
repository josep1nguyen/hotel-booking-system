const Booking = require("../models/Booking");
const { PENDING_PAYMENT_TIMEOUT_MINUTES } = require("../controllers/bookingController");

// Ràng buộc nghiệp vụ (Phần 1.3): Booking ở trạng thái PENDING_PAYMENT quá 15 phút mà chưa
// thanh toán sẽ tự động bị hủy để giải phóng phòng. Chạy định kỳ mỗi 60 giây.
function startAutoCancelJob() {
  const intervalMs = 60 * 1000;
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - PENDING_PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
      const result = await Booking.updateMany(
        { status: "PENDING_PAYMENT", createdAt: { $lt: cutoff } },
        { $set: { status: "CANCELLED", cancelReason: "Tự động hủy: quá hạn thanh toán 15 phút" } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[booking-service] Auto-cancelled ${result.modifiedCount} booking(s) quá hạn thanh toán`);
      }
    } catch (err) {
      console.error("[booking-service] Auto-cancel job error:", err.message);
    }
  }, intervalMs);
  console.log(`[booking-service] Auto-cancel job started (timeout = ${PENDING_PAYMENT_TIMEOUT_MINUTES} phút)`);
}

module.exports = startAutoCancelJob;
