const express = require("express");
const router = express.Router();
const {
  createBooking,
  cancelBooking,
  myBookings,
  getBookingById,
  adminListAll,
  adminUpdateStatus,
} = require("../controllers/bookingController");
const { verifyToken, requireAdmin } = require("../middleware/auth");

// Guest - FR-04, FR-06, FR-07
router.post("/", verifyToken, createBooking);
router.get("/me", verifyToken, myBookings);
router.get("/:id", verifyToken, getBookingById);
router.patch("/:id/cancel", verifyToken, cancelBooking);

// Admin - FR-09
router.get("/", verifyToken, requireAdmin, adminListAll);
router.patch("/:id/status", verifyToken, requireAdmin, adminUpdateStatus);

module.exports = router;
