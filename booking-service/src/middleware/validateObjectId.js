const mongoose = require("mongoose");

// Chặn sớm các request có :id sai định dạng MongoDB ObjectId (VD: người dùng gõ nhầm
// placeholder như "<BOOKING_ID>" chưa thay giá trị thật), trả về 400 rõ ràng thay vì để
// Mongoose ném CastError rơi xuống catch chung và hiển thị nhầm thành lỗi 500.
function validateObjectId(req, res, next) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: `ID không hợp lệ: "${id}"` });
  }
  next();
}

module.exports = validateObjectId;
