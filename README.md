# Hotel Booking System — Microservices

Tiến độ hiện tại: **Ngày 5/7** — đã hoàn thành **Auth, Room, Booking, Payment, Notification Service**, **API Gateway**, **RabbitMQ**.
Chỉ còn **Frontend** (Ngày 6) là chưa làm.

## Cấu trúc thư mục

```
hotel-booking-system/
├── docker-compose.yml       # Chạy toàn bộ 6 service + RabbitMQ + 5 MongoDB riêng
├── .env.example              # Copy thành .env, điền JWT_SECRET
├── api-gateway/               # Điểm vào duy nhất, xác thực JWT tập trung, proxy request
├── auth-service/              # FR-01 (đăng ký), FR-02 (đăng nhập)
├── room-service/               # FR-03 (tìm phòng), FR-08 (quản lý phòng - Admin)
├── booking-service/            # FR-04 (đặt phòng), FR-06 (hủy), FR-07 (lịch sử), FR-09 (Admin quản lý booking)
├── payment-service/            # FR-05 (thanh toán giả lập + hoàn tiền)
├── notification-service/       # FR-10 (thông báo - lắng nghe RabbitMQ)
└── frontend/                   # TODO - Ngày 6
```

## Chạy hệ thống (yêu cầu Docker + Docker Compose)

```bash
cp .env.example .env
docker compose up --build
```

Lần đầu sẽ khá lâu vì phải tải thêm image `rabbitmq:3-management` (~250MB) và build 2 service mới.

Sau khi chạy xong:
- **API Gateway** (dùng từ đây): http://localhost:4000
- Auth / Room / Booking / Payment / Notification Service (debug trực tiếp): 4001-4005
- **RabbitMQ Management UI**: http://localhost:15672 (đăng nhập `guest` / `guest`) — dùng để **xem trực quan** exchange, queue, message đang chạy qua hệ thống, rất hữu ích khi quay video demo Ngày 7.
- MongoDB Auth/Room/Booking/Payment/Notification: 27018-27022

## Test luồng đầy đủ: Đặt phòng → Thanh toán → Thông báo (qua Gateway, PowerShell)

### 1. Đăng ký, đăng nhập, tạo phòng (giống Ngày 3-4)
```powershell
curl -Method POST -Uri "http://localhost:4000/api/auth/register" -ContentType "application/json" -UseBasicParsing -Body '{"fullName":"Nguyen Van A","email":"guest3@example.com","phone":"0901234567","password":"123456"}'

$guestLogin = curl -Method POST -Uri "http://localhost:4000/api/auth/login" -ContentType "application/json" -UseBasicParsing -Body '{"email":"guest3@example.com","password":"123456"}'
$guestToken = ($guestLogin.Content | ConvertFrom-Json).token

# (Dùng $adminToken đã tạo từ Ngày 3 để tạo phòng, hoặc tạo tài khoản admin mới rồi nâng quyền qua mongosh như trước)
docker exec -it mongo-auth mongosh auth_db --eval 'db.users.updateOne({email:''admin2@example.com''},{$set:{role:''admin''}})'#nâng quyền lên admin

$roomBody = @{ roomNumber="201"; type="double"; pricePerNight=500000; capacity=2; description="Phong demo Ngay 5"; amenities=@("wifi","tv") } | ConvertTo-Json
$roomResponse = curl -Method POST -Uri "http://localhost:4000/api/rooms" -ContentType "application/json" -UseBasicParsing -Headers @{Authorization="Bearer $adminToken"} -Body $roomBody
$roomId = (($roomResponse.Content | ConvertFrom-Json).room)._id
```

### 2. Đặt phòng — giờ sẽ TỰ ĐỘNG xử lý thanh toán và publish sự kiện
```powershell
$bookingBody = @{ roomId=$roomId; checkIn="2026-08-01T14:00:00.000Z"; checkOut="2026-08-03T12:00:00.000Z" } | ConvertTo-Json
$bookingResponse = curl -Method POST -Uri "http://localhost:4000/api/bookings" -ContentType "application/json" -UseBasicParsing -Headers @{Authorization="Bearer $guestToken"} -Body $bookingBody
$bookingResponse.Content | ConvertFrom-Json
```
Quan sát field `booking.status`:
- `"CONFIRMED"` → thanh toán giả lập thành công (~85% khả năng, có thể chỉnh `PAYMENT_SUCCESS_RATE`)
- `"CANCELLED"` kèm `payment.status = "FAILED"` → thanh toán giả lập thất bại (~15% khả năng) — thử lại vài lần sẽ thấy cả 2 trường hợp

Muốn **demo chắc chắn luồng thất bại** (không phải chờ ngẫu nhiên): sửa `PAYMENT_FORCE_FAIL_THRESHOLD` trong `docker-compose.yml` (VD: `=100000`), restart `payment-service`, rồi đặt phòng với giá > 100,000đ sẽ luôn thất bại.

### 3. Xem thông báo đã nhận — FR-10
```powershell
curl -Method GET -Uri "http://localhost:4000/api/notifications/me" -UseBasicParsing -Headers @{Authorization="Bearer $guestToken"}
```
Sẽ thấy thông báo "Đặt phòng ... thành công" (nếu CONFIRMED) hoặc "Thanh toán ... thất bại" (nếu CANCELLED).

**Xem trực tiếp trong log Docker** (thấy rõ luồng bất đồng bộ qua RabbitMQ):
```powershell
docker compose logs -f payment-service notification-service
```

### 4. Hủy đặt phòng — kích hoạt hoàn tiền qua RabbitMQ
```powershell
$bookingId = (($bookingResponse.Content | ConvertFrom-Json).booking)._id
curl -Method PATCH -Uri "http://localhost:4000/api/bookings/$bookingId/cancel" -UseBasicParsing -Headers @{Authorization="Bearer $guestToken"}
```
Guest nhận response ngay lập tức (không cần chờ hoàn tiền xử lý xong). Vài giây sau, kiểm tra lại thông báo:
```powershell
curl -Method GET -Uri "http://localhost:4000/api/notifications/me" -UseBasicParsing -Headers @{Authorization="Bearer $guestToken"}
```
Sẽ thấy thêm thông báo "Booking đã được hủy" và "Hoàn tiền ... thành công".

### 5. Xem lịch sử giao dịch (Payment Service, debug trực tiếp)
```powershell
curl -Method GET -Uri "http://localhost:4004/api/payments/booking/$bookingId" -UseBasicParsing
```
Sẽ thấy 2 bản ghi: `CHARGE` (lúc đặt phòng) và `REFUND` (lúc hủy).

## Ghi chú kiến trúc quan trọng (Ngày 5)

- **RabbitMQ dùng 1 topic exchange `hotel.events`**, mỗi service tự khai báo queue riêng và bind theo routing key cần nghe — đúng mô hình pub/sub đã thiết kế ở Module View/C&C View (Booking/Payment publish, Notification + Payment subscribe).
- **Đồng bộ vs bất đồng bộ đúng theo Sequence Diagram đã thiết kế trước đó**:
  - Đặt phòng: Booking Service gọi Payment Service **đồng bộ (REST)** để biết ngay kết quả và cập nhật trạng thái booking.
  - Hủy phòng: Booking Service publish **bất đồng bộ (RabbitMQ)**, trả response cho Guest ngay, không chờ Payment Service hoàn tiền xong — đúng nguyên tắc Availability đã cam kết ở Phần 1.4.
- **Retry khi Payment Service không phản hồi (E1, FR-05)**: `paymentServiceClient.js` tự retry tối đa 3 lần trước khi coi là thất bại; nếu vẫn thất bại, booking giữ nguyên `PENDING_PAYMENT` để `autoCancelJob` tự dọn sau 15 phút, thay vì làm hỏng luôn request của Guest.
- **RabbitMQ connect-with-retry**: mỗi service tự retry kết nối RabbitMQ tối đa 10 lần (cách nhau 3s) khi khởi động, vì `depends_on` trong Docker Compose chỉ đảm bảo container đã "started", không đảm bảo RabbitMQ đã sẵn sàng nhận kết nối.
- **Publish là "best-effort"**: nếu RabbitMQ tạm thời không kết nối được, các service vẫn tiếp tục hoạt động bình thường (chỉ log lỗi, không chặn luồng chính) — thể hiện đúng Availability: một phần hệ thống lỗi không kéo sập toàn bộ.
- **Payment Gateway vẫn là giả lập**: `mockGateway.js` mô phỏng độ trễ mạng + tỷ lệ thành công cấu hình được qua `PAYMENT_SUCCESS_RATE`, cộng thêm rule tùy chọn `PAYMENT_FORCE_FAIL_THRESHOLD` để demo có chủ đích luồng thất bại.
- **Notification Service chỉ subscribe, không bị gọi trực tiếp** — đúng nguyên tắc decoupling đã trình bày từ Module View: không service nào phụ thuộc trực tiếp vào Notification Service còn sống hay không.
- **Lỗi đã fix (Ngày 4)**: mount proxy kiểu `app.use("/api/auth", createProxyMiddleware(...))` khiến Express tự cắt tiền tố khỏi request trước khi proxy nhận được → 404. Đã sửa bằng `pathFilter` (đúng cách dùng của `http-proxy-middleware` v3).
- **Lỗi đã fix (Ngày 4, #2)**: `:id` sai định dạng ObjectId (VD gõ nhầm placeholder) khiến Mongoose ném CastError, hiển thị nhầm thành lỗi 500. Đã thêm middleware `validateObjectId` ở Room Service và Booking Service, trả về 400 rõ ràng.
- **Lỗi đã fix (Ngày 5)**: Payment Service ban đầu hoàn tiền cho MỌI booking bị hủy, kể cả booking chưa từng thanh toán thành công (VD: hủy khi đang treo `PENDING_PAYMENT` do Payment Service từng không phản hồi lúc đặt phòng). Đã sửa: consumer `booking.cancelled` giờ kiểm tra có giao dịch `CHARGE` thành công trước đó cho đúng `bookingId` mới tiến hành hoàn tiền, nếu không có thì bỏ qua và chỉ log lại.

## Đã kiểm thử trong môi trường phát triển

- `npm install` chạy sạch cho cả 6 service.
- Toàn bộ file `.js` pass `node --check`.
- `docker-compose.yml` (12 service) đã validate YAML hợp lệ.
- **Đã cài RabbitMQ thật trong môi trường phát triển và test end-to-end** bằng cách gọi trực tiếp module `publishEvent`/`subscribeEvent` của Booking Service và Notification Service: xác nhận cả 4 loại sự kiện (`booking.confirmed`, `booking.cancelled`, `payment.failed`, `refund.completed`) được publish và consume chính xác qua đúng topic exchange `hotel.events` với routing key tương ứng.
- **Đã test riêng logic hoàn tiền có điều kiện** (fix ở trên) bằng model giả lập 2 kịch bản: booking chưa từng thanh toán (đúng: bỏ qua hoàn tiền) và booking đã thanh toán thành công (đúng: tiến hành hoàn tiền + publish `refund.completed`).
- Chưa test được với MongoDB thật trong môi trường này vì gói `mongodb-server` không còn nằm trong kho apt của Ubuntu (đã bị gỡ do license) — bạn cần chạy `docker compose up --build` ở máy có Docker để kiểm thử luồng lưu dữ liệu đầy đủ, đã có hướng dẫn từng bước ở trên.
