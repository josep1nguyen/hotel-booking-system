const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/booking_db";
  try {
    await mongoose.connect(uri);
    console.log(`[booking-service] MongoDB connected: ${uri}`);
  } catch (err) {
    console.error("[booking-service] MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
