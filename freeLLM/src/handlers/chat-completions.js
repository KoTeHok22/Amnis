const { resolveModel } = require("../catalog");
const { apiError, json, parseJsonBody, sse } = require("../http");
const {
  buildCompletionResponse,
  createChatId,
  endStream,
  writeContentChunk,
  writeFinishChunk,
  writeReasoningChunk,
  writeRoleChunk,
  writeUsageChunk,
} = require("../protocols/chat-completions");
const { buildChatUsage, flattenChatMessages } = require("../text");
const { executeUpstream } = require("../upstream");

function extractPrompt(body) {
  if (typeof body.prompt === "string" && body.prompt.trim()) return body.prompt.trim();
  return flattenChatMessages(body.messages);
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

async function handleChatCompletions(req, res) {
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
    apiError(res, 400, "Expected non-empty `messages` or `prompt`.");
    return;
  }

  const stream = Boolean(body.stream);
  const chatId = createChatId();

  logger?.info("chat.completions request", {
    model: model.id,
    stream,
  });
  logger?.body("chat.completions body", body);

  try {
    if (stream) {
      sse(res);
      writeRoleChunk(res, chatId, model.id);

      const result = await executeUpstream(model, promptText, (event) => {
        if (event.type === "reasoning" && typeof event.delta === "string" && event.delta) {
          writeReasoningChunk(res, chatId, model.id, event.delta);
        }
        if (typeof event.delta === "string" && event.delta && event.type !== "reasoning") {
          writeContentChunk(res, chatId, model.id, event.delta);
        }
      }, { logger });

      const finalText = result.content;
      const usage = buildChatUsage(promptText, finalText);
      if (body.stream_options?.include_usage) writeUsageChunk(res, chatId, model.id, usage);
      writeFinishChunk(res, chatId, model.id, result.finishReason || "stop");
      endStream(res);
      return;
    }

    const result = await executeUpstream(model, promptText, null, { logger });
    const finalText = result.content;
    const usage = buildChatUsage(promptText, finalText);
    const finishReason = result.finishReason || "stop";

    logger?.info("chat.completions completed", {
      model: model.id,
      stream,
      finishReason,
    });

    json(res, 200, buildCompletionResponse(
      chatId,
      model.id,
      finalText,
      usage,
      finishReason,
      result.reasoning || ""
    ));
  } catch (error) {
    logger?.error("chat.completions failed", {
      message: error.message,
      status: error.status || 502,
    });
    apiError(res, error.status || 502, error.message || "Upstream request failed", "api_error", "upstream_error");
  }
}

module.exports = {
  handleChatCompletions,
};
