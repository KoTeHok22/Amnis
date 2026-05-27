const http = require("http");
const { randomUUID } = require("crypto");

const { handleChatCompletions } = require("./handlers/chat-completions");
const { handleModels } = require("./handlers/models");
const { handleResponses } = require("./handlers/responses");
const { handleOptions, json, notFound } = require("./http");
const { createRequestLogger } = require("./logger");

function createServer() {
  return http.createServer((req, res) => {
    if (!req.url) {
      notFound(res);
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const requestId = randomUUID().slice(0, 8);
    const logger = createRequestLogger(requestId);
    req.context = { requestId, logger };
    res.setHeader("X-Request-Id", requestId);

    logger.info("incoming request", {
      method: req.method,
      path: url.pathname,
    });

    if (req.method === "OPTIONS") {
      handleOptions(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      handleModels(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      handleChatCompletions(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/responses") {
      handleResponses(req, res);
      return;
    }

    notFound(res);
  });
}

module.exports = {
  createServer,
};
