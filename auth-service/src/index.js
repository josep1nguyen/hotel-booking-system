require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "auth-service" }));
app.use("/api/auth", authRoutes);

// 404 fallback
app.use((req, res) => res.status(404).json({ message: "Route không tồn tại" }));

const PORT = process.env.PORT || 4001;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`[auth-service] listening on port ${PORT}`));
});
