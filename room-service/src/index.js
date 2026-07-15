require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const roomRoutes = require("./routes/roomRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "room-service" }));
app.use("/api/rooms", roomRoutes);

app.use((req, res) => res.status(404).json({ message: "Route không tồn tại" }));

const PORT = process.env.PORT || 4002;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`[room-service] listening on port ${PORT}`));
});
