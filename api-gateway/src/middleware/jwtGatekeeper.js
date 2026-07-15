const jwt = require("jsonwebtoken");

// Gateway đảm nhiệm xác thực JWT tập trung (quyết định kiến trúc đã nêu ở Phần 2 - Security).
// - Nếu có Authorization header: verify ngay tại Gateway; sai/hết hạn -> chặn luôn, trả 401,
//   KHÔNG forward xuống service phía sau (giảm tải, giảm bề mặt tấn công).
// - Nếu không có Authorization header: cho qua (vì có route public như /register, /login,
//   GET /rooms). Service phía sau (Auth/Room/Booking) tự quyết định route đó có bắt buộc
//   đăng nhập hay không bằng middleware verifyToken riêng của từng service (defense in depth).
function jwtGatekeeper(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return next(); // route public, để service phía sau tự xử lý
  }

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Sai định dạng Authorization header" });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    // Gắn thông tin user đã xác thực vào header để service phía sau tiện dùng (tuỳ chọn),
    // đồng thời vẫn forward nguyên Authorization header để service tự verify lại nếu cần.
    req.headers["x-user-id"] = String(decoded.userId);
    req.headers["x-user-role"] = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
  }
}

module.exports = jwtGatekeeper;
