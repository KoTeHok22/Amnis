function partText(part) {
  if (!part || typeof part !== "object") return "";

  if (typeof part.text === "string" && (part.type === "text" || part.type === "input_text" || part.type === "output_text")) {
    return part.text;
  }

  if (typeof part.image_url === "string" || typeof part.file_id === "string") {
    return "[non-text content omitted]";
  }

  if (typeof part.output === "string") return part.output;
  if (typeof part.content === "string") return part.content;
  return "";
}

function truncateText(text, max = 1200) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function normalizeContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map(partText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function flattenChatMessages(messages) {
  if (!Array.isArray(messages)) return "";

  return messages
    .map((message) => {
      if (!message || typeof message !== "object") return "";

      const role = typeof message.role === "string" ? message.role : "user";
      const content = normalizeContent(message.content);
      const blocks = [];

      if (content) blocks.push(`${role}: ${content}`);

      return blocks.join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function flattenResponsesInput(input) {
  if (typeof input === "string") return input.trim();
  if (!Array.isArray(input)) return "";

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return "";

      if (typeof item.role === "string") {
        const content = normalizeContent(item.content);
        return content ? `${item.role}: ${content}` : "";
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function formatSourcesText(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "";

  const lines = sources
    .map((source) => {
      const title = source?.title || source?.url;
      const url = source?.url;
      return title && url ? `- ${title}: ${url}` : "";
    })
    .filter(Boolean);

  if (lines.length === 0) return "";
  return `\n\nSources:\n${lines.join("\n")}`;
}

function appendSourcesText(text, sources) {
  return `${text || ""}${formatSourcesText(sources)}`.trim();
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function buildChatUsage(promptText, outputText, reasoningText = "") {
  const promptTokens = estimateTokens(promptText);
  const reasoningTokens = estimateTokens(reasoningText);
  const completionTokens = estimateTokens(outputText);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: {
      cached_tokens: 0,
    },
    completion_tokens_details: {
      reasoning_tokens: reasoningTokens,
    },
  };
}

function chunkText(text, size = 160) {
  const value = String(text || "");
  if (!value) return [];

  const chunks = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

module.exports = {
  appendSourcesText,
  buildChatUsage,
  chunkText,
  flattenChatMessages,
  flattenResponsesInput,
  formatSourcesText,
  truncateText,
};
