const fs = require("fs");
const path = require("path");
const { LOG_BODIES, LOG_LEVEL, LOG_STREAM_EVENTS } = require("./config");

const LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

const ACTIVE_LEVEL = LEVELS[LOG_LEVEL] || LEVELS.INFO;

const LOGS_DIR = path.resolve(__dirname, "..", "..", "logs");
const LOG_FILE_PATH = path.join(LOGS_DIR, "free_llm.jsonl");

let _fileStream = null;
let _writeQueue = [];
let _writeScheduled = false;

function ensureLogDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function flushToFile() {
  if (_writeQueue.length === 0) {
    _writeScheduled = false;
    return;
  }
  const batch = _writeQueue.join("");
  _writeQueue = [];
  _writeScheduled = false;
  try {
    if (!_fileStream) {
      ensureLogDir();
      _fileStream = fs.createWriteStream(LOG_FILE_PATH, { flags: "a" });
    }
    _fileStream.write(batch);
  } catch (err) {
    // silent fallback — logging must never crash the server
  }
}

function scheduleFlush() {
  if (!_writeScheduled) {
    _writeScheduled = true;
    setImmediate(flushToFile);
  }
}

function writeFileRecord(record) {
  _writeQueue.push(JSON.stringify(record) + "\n");
  scheduleFlush();
}

function shouldLog(level) {
  return (LEVELS[level] || LEVELS.INFO) >= ACTIVE_LEVEL;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function truncate(value, max = 1200) {
  const text = typeof value === "string" ? value : safeJson(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatMeta(meta) {
  if (!meta || typeof meta !== "object" || Object.keys(meta).length === 0) return "";
  return ` ${truncate(meta)}`;
}

function log(level, message, meta) {
  if (!shouldLog(level)) return;
  const line = `[${new Date().toISOString()}] ${level} ${message}${formatMeta(meta)}`;
  if (level === "ERROR") console.error(line);
  else console.log(line);
}

function createRequestLogger(requestId) {
  return {
    debug(message, meta) {
      log("DEBUG", `[${requestId}] ${message}`, meta);
      writeFileRecord({ ts: new Date().toISOString(), level: "DEBUG", cmp: "freeLLM", cat: "free_llm", msg: message, requestId, data: meta || {} });
    },
    info(message, meta) {
      log("INFO", `[${requestId}] ${message}`, meta);
      writeFileRecord({ ts: new Date().toISOString(), level: "INFO", cmp: "freeLLM", cat: "free_llm", msg: message, requestId, data: meta || {} });
    },
    warn(message, meta) {
      log("WARN", `[${requestId}] ${message}`, meta);
      writeFileRecord({ ts: new Date().toISOString(), level: "WARN", cmp: "freeLLM", cat: "free_llm", msg: message, requestId, data: meta || {} });
    },
    error(message, meta) {
      log("ERROR", `[${requestId}] ${message}`, meta);
      writeFileRecord({ ts: new Date().toISOString(), level: "ERROR", cmp: "freeLLM", cat: "free_llm", msg: message, requestId, data: meta || {} });
    },
    body(label, value) {
      if (!LOG_BODIES) return;
      log("DEBUG", `[${requestId}] ${label}`, value);
      writeFileRecord({ ts: new Date().toISOString(), level: "DEBUG", cmp: "freeLLM", cat: "free_llm", msg: label, requestId, data: { body: truncate(value, 4000) } });
    },
    stream(label, value) {
      if (!LOG_STREAM_EVENTS) return;
      log("DEBUG", `[${requestId}] ${label}`, value);
    },
  };
}

module.exports = {
  createRequestLogger,
};
