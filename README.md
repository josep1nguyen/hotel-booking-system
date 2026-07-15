# Hotel Booking System — Microservices

Tiến độ hiện tại: **Ngày 4/7** — đã hoàn thành **Auth Service**, **Room Service**, **Booking Service**, **API Gateway**.
Các service còn lại (Payment, Notification, Frontend) sẽ được bổ sung ở Ngày 5-6.

## Cấu trúc thư mục

```
hotel-booking-system/
├── docker-compose.yml       # Chạy toàn bộ service hiện có + 3 MongoDB riêng
├── .env.example              # Copy thành .env, điền JWT_SECRET
├── api-gateway/              # Điểm vào duy nhất, xác thực JWT tập trung, proxy request
├── auth-service/             # FR-01 (đăng ký), FR-02 (đăng nhập)
├── room-service/             # FR-03 (tìm phòng), FR-08 (quản lý phòng - Admin)
├── booking-service/          # FR-04 (đặt phòng), FR-06 (hủy), FR-07 (lịch sử), FR-09 (Admin quản lý booking)
├── payment-service/          # TODO - Ngày 5
├── notification-service/     # TODO - Ngày 5
└── frontend/                 # TODO - Ngày 6
```

## Chạy hệ thống (yêu cầu Docker + Docker Compose)

```bash
cp .env.example .env
docker compose up --build
```

Sau khi chạy xong:
- **API Gateway** (điểm vào chính, khuyến nghị dùng từ đây trở đi): http://localhost:4000
- Auth Service (vẫn expose trực tiếp để debug): http://localhost:4001
- Room Service: http://localhost:4002
- Booking Service: http://localhost:4003
- MongoDB Auth/Room/Booking: localhost:27018 / 27019 / 27020

Kiểm tra service sống:
```bash
curl http://localhost:4000/health
curl http://localhost:4003/health
```

## Test API qua API Gateway (khuyến nghị dùng cổng 4000 từ giờ trở đi)

Toàn bộ route dưới đây đi qua Gateway (`localhost:4000`), Gateway sẽ tự xác thực JWT (nếu có token) trước khi forward xuống đúng service — không cần gọi thẳng port 4001/4002/4003 nữa (dù vẫn hoạt động song song để debug).

### 1. Đăng ký & đăng nhập (giống Ngày 3, đổi port 4001 → 4000)
```powershell
curl -Method POST -Uri "http://localhost:4000/api/auth/register" -ContentType "application/json" -UseBasicParsing -Body '{"fullName":"Nguyen Van A","email":"guest1@example.com","phone":"0901234567","password":"123456"}'

curl -Method POST -Uri "http://localhost:4000/api/auth/login" -ContentType "application/json" -UseBasicParsing -Body '{"email":"guest1@example.com","password":"123456"}'
```
→ Copy `token` để dùng cho các bước có `Authorization: Bearer <TOKEN>` bên dưới.

### 2. Tạo phòng (Admin) — qua Gateway
```powershell
curl -Method POST -Uri "http://localhost:4000/api/rooms" -ContentType "application/json" -UseBasicParsing -Headers @{Authorization="Bearer <ADMIN_TOKEN>"} -Body '{"roomNumber":"101","type":"double","pricePerNight":500000,"capacity":2,"description":"Phong doi view thanh pho","amenities":["wifi","tv"]}'
```

### 3. Đặt phòng — FR-04 (Guest)
```powershell
curl -Method POST -Uri "http://localhost:4000/api/bookings" -ContentType "application/json" -UseBasicParsing -Headers @{Authorization="Bearer <GUEST_TOKEN>"} -Body '{"roomId":"<ROOM_ID>","checkIn":"2026-08-01T14:00:00.000Z","checkOut":"2026-08-03T12:00:00.000Z"}'
```
→ Booking được tạo với `status: "PENDING_PAYMENT"`. Việc chuyển sang `CONFIRMED` qua Payment Service sẽ hoàn thiện ở Ngày 5.

Thử đặt lại **đúng phòng, đúng khung thời gian** lần thứ 2 bằng 1 tài khoản khác → sẽ nhận lỗi `409 Conflict` (đúng luồng E1 race-condition đã thiết kế ở Sequence Diagram FR-04).

### 4. Xem lịch sử đặt phòng — FR-07 (Guest)
```powershell
curl -Method GET -Uri "http://localhost:4000/api/bookings/me" -UseBasicParsing -Headers @{Authorization="Bearer <GUEST_TOKEN>"}
```

### 5. Hủy đặt phòng — FR-06 (Guest)
```powershell
curl -Method PATCH -Uri "http://localhost:4000/api/bookings/<BOOKING_ID>/cancel" -UseBasicParsing -Headers @{Authorization="Bearer <GUEST_TOKEN>"}
```
Nếu check-in còn dưới 24 giờ nữa → nhận lỗi `403 Forbidden` (đúng chính sách hủy đã cam kết ở Phần 1.3).

### 6. Quản lý booking — FR-09 (Admin)
```powershell
curl -Method GET -Uri "http://localhost:4000/api/bookings" -UseBasicParsing -Headers @{Authorization="Bearer <ADMIN_TOKEN>"}

curl -Method PATCH -Uri "http://localhost:4000/api/bookings/<BOOKING_ID>/status" -ContentType "application/json" -UseBasicParsing -Headers @{Authorization="Bearer <ADMIN_TOKEN>"} -Body '{"status":"CONFIRMED"}'
```

## Ghi chú kiến trúc quan trọng (Ngày 4)

- **API Gateway là điểm vào duy nhất**: dùng `http-proxy-middleware` để forward request tới đúng service theo prefix path (`/api/auth`, `/api/rooms`, `/api/bookings`). Gateway **không** dùng `express.json()` vì việc parse JSON ở Gateway sẽ làm hỏng body gốc trước khi proxy — đây là lỗi rất dễ mắc phải khi làm proxy, đã tránh ngay từ đầu.
- **Xác thực JWT tập trung tại Gateway**: nếu request có `Authorization` header, Gateway verify ngay — sai/hết hạn thì chặn luôn (401), không tốn tài nguyên forward xuống service. Nếu không có token (route public như `/register`, `/login`, `GET /rooms`), Gateway cho qua, service phía sau tự quyết định có bắt buộc đăng nhập hay không (defense in depth — đúng theo quyết định kiến trúc đã trình bày ở Phần 2).
- **Chống double-booking (Reliability)**: Booking Service tự kiểm tra overlap ngay trên Booking DB của chính nó (`hasOverlap`) ngay trước khi tạo booking mới — đúng nguyên tắc "double-check tại thời điểm ghi" đã giải thích ở Phần 2, và khớp với nhánh race-condition trong Sequence Diagram FR-04.
- **Auto-cancel booking treo thanh toán**: `autoCancelJob.js` chạy nền mỗi 60 giây, tự huỷ các booking `PENDING_PAYMENT` quá 15 phút — hiện thực hoá đúng ràng buộc nghiệp vụ đã cam kết ở Phần 1.3.
- **Booking Service gọi Room Service qua REST đồng bộ** (`roomServiceClient.js`) để lấy giá phòng & xác nhận phòng còn active — đúng luồng "GET availability" trong Sequence Diagram FR-04. Room Service không biết gì về dữ liệu booking (giữ đúng Database per Service).
- **Payment Service chưa tồn tại**: booking hiện dừng ở `PENDING_PAYMENT`, có TODO comment rõ ràng trong code cho việc tích hợp Payment Service + RabbitMQ ở Ngày 5.
- **Lỗi đã fix**: bản đầu Ngày 4 mount proxy kiểu `app.use("/api/auth", createProxyMiddleware(...))` khiến Express tự cắt tiền tố `/api/auth` khỏi request trước khi proxy nhận được, làm service phía sau nhận nhầm path và trả 404. Đã sửa bằng cách mount proxy ở root và dùng option `pathFilter` (đúng cách dùng khuyến nghị của `http-proxy-middleware` v3) để giữ nguyên path gốc khi forward.

## Đã kiểm thử trong môi trường phát triển

- `npm install` chạy sạch cho cả 4 service (`auth`, `room`, `booking`, `api-gateway`).
- Toàn bộ file `.js` pass `node --check` (không lỗi cú pháp).
- `docker-compose.yml` đã validate hợp lệ (parse YAML thành công).
- Chưa test integration đầy đủ với MongoDB thật trong sandbox này do giới hạn mạng — bạn cần chạy `docker compose up --build` ở máy có Docker để kiểm thử luồng API đầy đủ, đã có sẵn ví dụ curl từng bước ở trên.

