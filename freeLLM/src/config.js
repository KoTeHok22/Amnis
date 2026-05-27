const PORT = Number(process.env.PORT || 11434);
const HOST = process.env.HOST || "127.0.0.1";
const LOG_LEVEL = String(process.env.LOG_LEVEL || "INFO").toUpperCase();
const LOG_BODIES = process.env.LOG_BODIES === "1";
const LOG_STREAM_EVENTS = process.env.LOG_STREAM_EVENTS === "1";
const STREAM_IDLE_TIMEOUT_MS = Number(process.env.STREAM_IDLE_TIMEOUT_MS || 90000);

module.exports = {
  HOST,
  LOG_BODIES,
  LOG_LEVEL,
  LOG_STREAM_EVENTS,
  PORT,
  STREAM_IDLE_TIMEOUT_MS,
};
