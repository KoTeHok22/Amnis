function withCorsHeaders(headers = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...headers,
  };
}

function json(res, status, payload) {
  res.writeHead(status, withCorsHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "X-Adapter": "qwen-openai-adapter",
  }));
  res.end(JSON.stringify(payload));
}

function sse(res) {
  res.writeHead(200, withCorsHeaders({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Adapter": "qwen-openai-adapter",
  }));
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeSseDone(res) {
  res.write("data: [DONE]\n\n");
  res.end();
}

function apiError(res, status, message, type = "invalid_request_error", code = "bad_request") {
  json(res, status, {
    error: {
      message,
      type,
      code,
    },
  });
}

function notFound(res) {
  apiError(res, 404, "Not found", "invalid_request_error", "not_found");
}

function handleOptions(res) {
  res.writeHead(204, withCorsHeaders());
  res.end();
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

module.exports = {
  apiError,
  handleOptions,
  json,
  notFound,
  parseJsonBody,
  sse,
  writeSse,
  writeSseDone,
};
