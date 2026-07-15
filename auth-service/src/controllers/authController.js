const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// FR-01: Đăng ký tài khoản
async function register(req, res) {
  try {
    const { fullName, email, phone, password } = req.body;

    // E2: Dữ liệu không hợp lệ
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc (fullName, email, password)" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Email không đúng định dạng" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Mật khẩu phải có tối thiểu 6 ký tự" });
    }

    // E1: Email đã tồn tại
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Email đã được sử dụng" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: "guest",
    });

    return res.status(201).json({
      message: "Đăng ký thành công",
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại" });
  }
}

// FR-02: Đăng nhập
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Thiếu email hoặc mật khẩu" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    // E1: Sai email/mật khẩu
    if (!user) {
      return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
    }

    // E2: Tài khoản bị khoá
    if (user.isLocked) {
      return res.status(403).json({ message: "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      message: "Đăng nhập thành công",
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi hệ thống, vui lòng thử lại" });
  }
}

// Lấy thông tin user hiện tại (dùng cho các service khác xác minh nhanh nếu cần)
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    return res.status(200).json({ user });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
}

module.exports = { register, login, getMe };
