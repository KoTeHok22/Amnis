const { resolveModel } = require("../catalog");
const { apiError, json, parseJsonBody, sse } = require("../http");
const {
  buildMessageItem,
  buildResponseObject,
  createItemId,
  createResponseId,
  endStream,
  toResponsesUsage,
  writeCompleted,
  writeCreated,
  writeMessageDone,
  writeMessageStart,
  writeTextDelta,
} = require("../protocols/responses");
const { buildChatUsage, flattenResponsesInput } = require("../text");
const { executeUpstream } = require("../upstream");

function extractPrompt(body) {
  if (typeof body.prompt === "string" && body.prompt.trim()) return body.prompt.trim();
  return flattenResponsesInput(body.input);
}

function rejectUnsupportedTools(body, res) {
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    apiError(res, 400, "This adapter does not support `tools`.", "invalid_request_error", "unsupported_feature");
    return true;
  }

  if (body.tool_choice != null && body.tool_choice !== "none") {
    apiError(res, 400, "This adapter does not support `tool_choice`.", "invalid_request_error", "unsupported_feature");
    return true;
  }

  return false;
}

async function handleResponses(req, res) {
  const logger = req.context?.logger;
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    apiError(res, 400, error.message);
    return;
  }

  const model = resolveModel(body.model);
  if (!model) {
    apiError(res, 400, `Unknown model: ${body.model || ""}`.trim(), "invalid_request_error", "model_not_found");
    return;
  }

  if (rejectUnsupportedTools(body, res)) return;

  const promptText = extractPrompt(body);
  if (!promptText) {
    apiError(res, 400, "Expected non-empty `input` or `prompt`.");
    return;
  }

  const stream = Boolean(body.stream);
  const responseId = createResponseId();

  logger?.info("responses request", {
    model: model.id,
    stream,
  });
  logger?.body("responses body", body);

  try {
    if (stream) {
      sse(res);
      writeCreated(res, responseId, model.id);

      const itemId = createItemId("msg");
      writeMessageStart(res, itemId);

      const result = await executeUpstream(model, promptText, (event) => {
        if (typeof event.delta === "string" && event.delta) {
          writeTextDelta(res, itemId, event.delta);
        }
      }, { logger });

      const finalText = result.content;
      const usage = toResponsesUsage(buildChatUsage(promptText, finalText));
      const output = [buildMessageItem(itemId, finalText)];
      const responseObject = buildResponseObject(responseId, model.id, output, usage);
      writeMessageDone(res, itemId, finalText);
      writeCompleted(res, responseObject);
      endStream(res);
      return;
    }

    const result = await executeUpstream(model, promptText, null, { logger });
    const finalText = result.content;
    const usage = toResponsesUsage(buildChatUsage(promptText, finalText));

    logger?.info("responses completed", {
      model: model.id,
      stream,
    });

    const output = [buildMessageItem(createItemId("msg"), finalText)];

    json(res, 200, buildResponseObject(responseId, model.id, output, usage));
  } catch (error) {
    logger?.error("responses failed", {
      message: error.message,
      status: error.status || 502,
    });
    apiError(res, error.status || 502, error.message || "Upstream request failed", "api_error", "upstream_error");
  }
}

module.exports = {
  handleResponses,
};
