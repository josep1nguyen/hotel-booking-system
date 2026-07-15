const axios = require("axios");

const ROOM_SERVICE_URL = process.env.ROOM_SERVICE_URL || "http://localhost:4002";

// Booking Service -> Room Service: lấy thông tin phòng (đúng luồng REST đồng bộ trong
// Sequence Diagram FR-04: "GET availability?checkIn&checkOut"). Room Service chỉ trả về
// trạng thái active/inactive của phòng; việc đối chiếu ngày trùng lịch do CHÍNH Booking Service
// tự thực hiện trên Booking DB của nó (vì chỉ Booking Service mới có dữ liệu booking).
async function getRoomById(roomId) {
  try {
    const { data } = await axios.get(`${ROOM_SERVICE_URL}/api/rooms/${roomId}`, {
      timeout: 5000,
    });
    return data.room;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    throw new Error("Không thể kết nối tới Room Service");
  }
}

module.exports = { getRoomById };
