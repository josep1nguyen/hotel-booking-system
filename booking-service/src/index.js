require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const bookingRoutes = require("./routes/bookingRoutes");
const startAutoCancelJob = require("./jobs/autoCancelJob");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "booking-service" }));
app.use("/api/bookings", bookingRoutes);

app.use((req, res) => res.status(404).json({ message: "Route không tồn tại" }));

const PORT = process.env.PORT || 4003;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`[booking-service] listening on port ${PORT}`));
  startAutoCancelJob();
});
