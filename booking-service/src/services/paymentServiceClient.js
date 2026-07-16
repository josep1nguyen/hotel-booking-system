const axios = require("axios");

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:4004";

// Booking Service -> Payment Service: gọi ĐỒNG BỘ (REST), đúng luồng trong Sequence Diagram
// FR-04: "B->>P: POST /payments (bookingId, amount)" rồi chờ nhận SUCCESS/FAILED ngay để
// quyết định booking CONFIRMED hay CANCELLED.
// E1 (FR-05): Payment Gateway timeout -> retry tối đa 3 lần rồi mới báo thất bại.
async function chargePayment({ bookingId, guestId, amount }, retriesLeft = 3) {
  try {
    const { data } = await axios.post(
      `${PAYMENT_SERVICE_URL}/api/payments`,
      { bookingId, guestId, amount },
      { timeout: 6000 }
    );
    return data; // { status: 'SUCCESS' | 'FAILED', transactionId, reason? }
  } catch (err) {
    if (retriesLeft > 0) {
      console.warn(
        `[booking-service] Gọi Payment Service thất bại, thử lại (còn ${retriesLeft} lần): ${err.message}`
      );
      await new Promise((r) => setTimeout(r, 500));
      return chargePayment({ bookingId, guestId, amount }, retriesLeft - 1);
    }
    throw new Error("Không thể kết nối tới Payment Service sau nhiều lần thử");
  }
}

module.exports = { chargePayment };
