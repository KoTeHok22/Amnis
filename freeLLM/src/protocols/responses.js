const { randomUUID } = require("crypto");

const { writeSse, writeSseDone } = require("../http");
function createResponseId() {
  return `resp_${randomUUID().replace(/-/g, "")}`;
}

function createItemId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function toResponsesUsage(chatUsage) {
  return {
    input_tokens: chatUsage.prompt_tokens,
    input_tokens_details: chatUsage.prompt_tokens_details,
    output_tokens: chatUsage.completion_tokens,
    output_tokens_details: chatUsage.completion_tokens_details,
    total_tokens: chatUsage.total_tokens,
  };
}

function buildMessageItem(itemId, text) {
  return {
    id: itemId,
    type: "message",
    status: "completed",
    role: "assistant",
    content: [
      {
        type: "output_text",
        text,
        annotations: [],
      },
    ],
  };
}

function writeCreated(res, responseId, model) {
  writeSse(res, {
    type: "response.created",
    response: {
      id: responseId,
      object: "response",
      model,
      created_at: Math.floor(Date.now() / 1000),
    },
  });
}

function writeMessageStart(res, itemId) {
  writeSse(res, {
    type: "response.output_item.added",
    item: {
      id: itemId,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [],
    },
  });

  writeSse(res, {
    type: "response.content_part.added",
    item_id: itemId,
    part: {
      type: "output_text",
      text: "",
      annotations: [],
    },
  });
}

function writeTextDelta(res, itemId, delta) {
  if (!delta) return;
  writeSse(res, {
    type: "response.output_text.delta",
    item_id: itemId,
    delta,
  });
}

function writeMessageDone(res, itemId, text) {
  writeSse(res, {
    type: "response.output_item.done",
    item: buildMessageItem(itemId, text),
  });
}

function writeCompleted(res, response) {
  writeSse(res, {
    type: "response.completed",
    response,
  });
}

function endStream(res) {
  writeSseDone(res);
}

function buildResponseObject(responseId, model, output, usage) {
  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model,
    output,
    parallel_tool_calls: false,
    usage,
  };
}

module.exports = {
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
};
