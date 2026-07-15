const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    guestId: { type: String, required: true, index: true },
    roomId: { type: String, required: true, index: true },
    roomNumber: { type: String },
    roomType: { type: String },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    pricePerNight: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED"],
      default: "PENDING_PAYMENT",
      index: true,
    },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

// Hỗ trợ truy vấn kiểm tra overlap nhanh: cùng roomId, status còn hiệu lực (không phải CANCELLED)
bookingSchema.index({ roomId: 1, status: 1, checkIn: 1, checkOut: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
