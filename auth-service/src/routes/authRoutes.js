const express = require("express");
const router = express.Router();
const { register, login, getMe } = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

router.post("/register", register); // FR-01
router.post("/login", login); // FR-02
router.get("/me", verifyToken, getMe);

module.exports = router;
