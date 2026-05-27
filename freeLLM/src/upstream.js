const { executeQwen } = require("./qwen");

async function executeUpstream(model, promptText, onEvent, context = {}) {
  const logger = context.logger;
  const shouldStop = typeof context.shouldStop === "function" ? context.shouldStop : null;

  logger?.info("upstream request", {
    model: model.id,
    upstreamId: model.upstreamId,
    promptLength: promptText.length,
  });
  logger?.body("upstream prompt", promptText.slice(0, 500));

  try {
    const result = await executeQwen(model, promptText, onEvent, {
      logger,
      shouldStop,
    });

    logger?.info("upstream request completed", {
      contentLength: result.content.length,
      finishReason: result.finishReason,
      truncated: result.truncated,
    });

    return {
      content: result.content,
      reasoning: result.reasoning || "",
      sources: [],
      searchResults: [],
      finishReason: result.finishReason || "stop",
      statuses: [],
      sawDone: result.sawFinish,
      sawFinish: result.sawFinish,
      truncated: result.truncated,
    };
  } catch (error) {
    logger?.error("upstream request failed", {
      message: error.message,
      status: error.status || 502,
    });
    const wrapped = new Error(error.message || "Qwen upstream request failed");
    wrapped.status = error.status || 502;
    throw wrapped;
  }
}

module.exports = {
  executeUpstream,
};
