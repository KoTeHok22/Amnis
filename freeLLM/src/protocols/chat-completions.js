const { randomUUID } = require("crypto");

const { writeSse, writeSseDone } = require("../http");
function createChatId() {
  return `chatcmpl_${randomUUID().replace(/-/g, "")}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function writeRoleChunk(res, id, model) {
  writeSse(res, {
    id,
    object: "chat.completion.chunk",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant" },
        finish_reason: null,
      },
    ],
  });
}

function writeContentChunk(res, id, model, content) {
  if (!content) return;

  writeSse(res, {
    id,
    object: "chat.completion.chunk",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null,
      },
    ],
  });
}

function writeReasoningChunk(res, id, model, reasoning) {
  if (!reasoning) return;

  writeSse(res, {
    id,
    object: "chat.completion.chunk",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        delta: { reasoning_content: reasoning },
        finish_reason: null,
      },
    ],
  });
}

function writeFinishChunk(res, id, model, finishReason) {
  writeSse(res, {
    id,
    object: "chat.completion.chunk",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
  });
}

function writeUsageChunk(res, id, model, usage) {
  writeSse(res, {
    id,
    object: "chat.completion.chunk",
    created: nowSeconds(),
    model,
    choices: [],
    usage,
  });
}

function endStream(res) {
  writeSseDone(res);
}

function buildCompletionResponse(id, model, content, usage, finishReason, reasoning) {
  const message = {
    role: "assistant",
    content,
  };

  if (reasoning) {
    message.reasoning_content = reasoning;
  }

  return {
    id,
    object: "chat.completion",
    created: nowSeconds(),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
    usage,
  };
}

module.exports = {
  buildCompletionResponse,
  createChatId,
  endStream,
  writeContentChunk,
  writeFinishChunk,
  writeReasoningChunk,
  writeRoleChunk,
  writeUsageChunk,
};
