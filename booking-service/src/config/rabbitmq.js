const amqp = require("amqplib");

const EXCHANGE = "hotel.events";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";

let channelPromise = null;

async function connectWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      const channel = await conn.createChannel();
      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      console.log(`[booking-service] RabbitMQ connected (attempt ${attempt})`);
      conn.on("error", (err) => console.error("[booking-service] RabbitMQ connection error:", err.message));
      conn.on("close", () => {
        console.warn("[booking-service] RabbitMQ connection closed, will retry on next publish");
        channelPromise = null;
      });
      return channel;
    } catch (err) {
      console.warn(
        `[booking-service] RabbitMQ connect failed (attempt ${attempt}/${maxRetries}): ${err.message}`
      );
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function getChannel() {
  if (!channelPromise) {
    channelPromise = connectWithRetry();
  }
  return channelPromise;
}

async function publishEvent(routingKey, payload) {
  try {
    const channel = await getChannel();
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
    });
    console.log(`[booking-service] published event "${routingKey}"`);
  } catch (err) {
    // Best-effort: publish thất bại không chặn luồng chính (Guest vẫn nhận response bình
    // thường); chỉ ảnh hưởng tới việc gửi thông báo, chấp nhận được theo Availability QA scenario.
    console.error(`[booking-service] failed to publish "${routingKey}":`, err.message);
  }
}

module.exports = { publishEvent, EXCHANGE };
