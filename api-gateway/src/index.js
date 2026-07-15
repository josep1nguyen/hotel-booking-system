require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const jwtGatekeeper = require("./middleware/jwtGatekeeper");

const app = express();
app.use(cors());
// LƯU Ý: không dùng express.json() ở đây, vì Gateway chỉ forward (proxy) request nguyên vẹn
// xuống service phía sau. Nếu parse JSON ở Gateway rồi mới proxy, body gốc sẽ bị mất/đổi dạng.

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:4001";
const ROOM_SERVICE_URL = process.env.ROOM_SERVICE_URL || "http://localhost:4002";
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || "http://localhost:4003";

app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "api-gateway" }));

// Áp dụng xác thực JWT tập trung cho MỌI request đi qua Gateway trước khi route
app.use(jwtGatekeeper);

// LƯU Ý QUAN TRỌNG: không dùng app.use("/api/auth", createProxyMiddleware(...)) vì Express sẽ
// tự cắt bỏ tiền tố "/api/auth" khỏi req.url TRƯỚC khi middleware proxy nhận được request,
// khiến service phía sau nhận nhầm path "/register" thay vì "/api/auth/register" -> 404.
// Cách đúng: mount proxy ở root và dùng "pathFilter" để proxy tự lọc theo path, nhờ đó giữ
// nguyên toàn bộ req.url gốc khi forward xuống service.
app.use(
  createProxyMiddleware({
    pathFilter: "/api/auth",
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
  })
);

app.use(
  createProxyMiddleware({
    pathFilter: "/api/rooms",
    target: ROOM_SERVICE_URL,
    changeOrigin: true,
  })
);

app.use(
  createProxyMiddleware({
    pathFilter: "/api/bookings",
    target: BOOKING_SERVICE_URL,
    changeOrigin: true,
  })
);

app.use((req, res) => res.status(404).json({ message: "Route không tồn tại trên API Gateway" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[api-gateway] listening on port ${PORT}`);
  console.log(`[api-gateway] -> auth: ${AUTH_SERVICE_URL}`);
  console.log(`[api-gateway] -> room: ${ROOM_SERVICE_URL}`);
  console.log(`[api-gateway] -> booking: ${BOOKING_SERVICE_URL}`);
});
