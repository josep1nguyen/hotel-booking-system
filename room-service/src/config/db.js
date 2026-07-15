const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/room_db";
  try {
    await mongoose.connect(uri);
    console.log(`[room-service] MongoDB connected: ${uri}`);
  } catch (err) {
    console.error("[room-service] MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
