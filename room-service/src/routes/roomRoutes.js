const express = require("express");
const router = express.Router();
const {
  searchRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  listAllRoomsAdmin,
} = require("../controllers/roomController");
const { verifyToken, requireAdmin } = require("../middleware/auth");

// Public / Guest
router.get("/", searchRooms); // FR-03, hỗ trợ query: checkIn, checkOut, type, minPrice, maxPrice
router.get("/:id", getRoomById);

// Admin only - FR-08
router.get("/admin/all", verifyToken, requireAdmin, listAllRoomsAdmin);
router.post("/", verifyToken, requireAdmin, createRoom);
router.put("/:id", verifyToken, requireAdmin, updateRoom);
router.delete("/:id", verifyToken, requireAdmin, deleteRoom);

module.exports = router;
