const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { STREAM_IDLE_TIMEOUT_MS } = require("./config");

const QWEN_BASE = "https://chat.qwen.ai";
const DEFAULT_MODEL = "qwen3.6-plus";

function loadAccounts() {
  const filePath = path.resolve(__dirname, "..", "OLD", "accounts.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("accounts.json is empty or invalid");
  }
  return data
    .filter((a) => a.email && a.password)
    .map((a) => ({ ...a, auth_token: null }));
}

const accounts = loadAccounts();
let accountIndex = 0;

function nextAccount() {
  const account = accounts[accountIndex % accounts.length];
  accountIndex = (accountIndex + 1) % accounts.length;
  return account;
}

async function ensureAuthToken(account, logger) {
  if (account.auth_token) return account.auth_token;

  logger?.info("qwen auth: fetching token", { email: account.email });

  const res = await fetch(`${QWEN_BASE}/api/v1/auths/signin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      source: "web",
      version: "0.2.57",
      "bx-v": "2.5.36",
    },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Auth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const setCookie = res.headers.get("set-cookie") || "";
  const cookieToken = setCookie.match(/token=([^;]+)/)?.[1] || null;

  const data = await res.json().catch(() => ({}));
  const token = data.token || cookieToken;

  if (!token) {
    if (data.data?.token) return data.data.token;
    throw new Error("Auth response missing token");
  }

  account.auth_token = token;
  logger?.info("qwen auth: token obtained", { email: account.email });
  return token;
}

async function createChat(token, model, logger) {
  logger?.info("qwen: creating chat");

  const res = await fetch(`${QWEN_BASE}/api/v2/chats/new`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      source: "web",
      version: "0.2.57",
      "bx-v": "2.5.36",
    },
    body: JSON.stringify({
      title: "API Chat",
      models: [model || DEFAULT_MODEL],
      chat_mode: "normal",
      chat_type: "t2t",
      timestamp: Date.now(),
      project_id: "",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error(`Chat creation unauthorized: ${text.slice(0, 200)}`), { status: 401 });
    }
    throw new Error(`Chat creation failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.success || !data.data?.id) {
    throw new Error(`Chat creation failed: ${JSON.stringify(data).slice(0, 200)}`);
  }

  logger?.info("qwen: chat created", { chatId: data.data.id });
  return data.data.id;
}

async function sendMessage(token, chatId, model, messageText, parentId, logger, onEvent, shouldStop) {
  const fid = randomUUID();
  const childId = randomUUID();

  const payload = {
    stream: true,
    version: "2.1",
    incremental_output: true,
    chat_id: chatId,
    chat_mode: "normal",
    model: model || DEFAULT_MODEL,
    parent_id: parentId || null,
    messages: [
      {
        fid,
        parentId: parentId || null,
        childrenIds: [childId],
        role: "user",
        content: messageText,
        user_action: "chat",
        files: [],
        timestamp: Math.floor(Date.now() / 1000),
        models: [model || DEFAULT_MODEL],
        chat_type: "t2t",
        feature_config: {
          thinking_enabled: true,
          output_schema: "phase",
          research_mode: "normal",
          auto_thinking: true,
          thinking_mode: "Deep",
          auto_search: true,
        },
        extra: {
          meta: { subChatType: "t2t" },
        },
        sub_chat_type: "t2t",
        parent_id: parentId || null,
      },
    ],
    timestamp: Date.now(),
  };

  const url = `${QWEN_BASE}/api/v2/chat/completions?chat_id=${chatId}`;

  logger?.info("qwen: sending message", { chatId, contentLength: messageText.length });
  logger?.body("qwen request body", payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "text/event-stream",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      source: "web",
      version: "0.2.57",
      "bx-v": "2.5.36",
      "x-accel-buffering": "no",
      referer: `${QWEN_BASE}/c/${chatId}`,
    },
    body: JSON.stringify(payload),
  }).catch((error) => ({ ok: false, status: 502, error }));

  if (!res.ok) {
    const detail = res.error
      ? res.error.message
      : (await res.text().catch(() => "")).slice(0, 300);
    logger?.error("qwen: message send failed", { status: res.status || 502, detail });
    const err = new Error(detail || "Qwen API request failed");
    err.status = res.status || 502;
    throw err;
  }

  if (!res.body) {
    throw new Error("Qwen returned empty response body");
  }

  const result = {
    content: "",
    reasoning: "",
    finishReason: "stop",
    sawFinish: false,
    truncated: false,
    assistantMessageId: null,
    responseId: null,
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let lastActivityAt = Date.now();

  function touchActivity() {
    lastActivityAt = Date.now();
  }

  async function readWithIdleTimeout() {
    const idleTimeout = Math.max(STREAM_IDLE_TIMEOUT_MS, 1000);
    const remaining = Math.max(idleTimeout - (Date.now() - lastActivityAt), 1);
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`Upstream stream idle timeout after ${idleTimeout}ms without events`);
        error.status = 504;
        error.code = "stream_idle_timeout";
        reject(error);
      }, remaining);
    });
    try {
      return await Promise.race([reader.read(), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  try {
    while (!done) {
      const chunk = await readWithIdleTimeout();
      if (chunk.value && chunk.value.length) {
        touchActivity();
      }
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const payloadText = line.slice(5).trim();
        if (!payloadText) continue;
        if (payloadText === "[DONE]") {
          done = true;
          break;
        }

        let event;
        try {
          event = JSON.parse(payloadText);
        } catch {
          continue;
        }

        touchActivity();

        logger?.stream("qwen sse event", event);

        const created = event["response.created"];
        if (created && created.response_id) {
          result.responseId = created.response_id;
        }

        const choices = event.choices;
        if (!Array.isArray(choices) || choices.length === 0) continue;

        const delta = choices[0].delta;
        if (!delta) continue;

        if (delta.role === "assistant" && delta.status === "finished" && delta.phase === "answer") {
          result.sawFinish = true;
          done = true;
        }

        if (delta.phase === "think" && typeof delta.content === "string" && delta.content) {
          result.reasoning += delta.content;
          if (onEvent) {
            onEvent({ type: "reasoning", delta: delta.content });
          }
        }

        if (delta.phase === "answer" && typeof delta.content === "string" && delta.content) {
          result.content += delta.content;
          if (onEvent) {
            onEvent({ delta: delta.content });
          }
        }
      }

      if (chunk.done) done = true;

      if (shouldStop && shouldStop(result)) {
        result.truncated = true;
        done = true;
        try { await reader.cancel("stopped"); } catch {}
        break;
      }
    }
  } catch (error) {
    const isRecoverable = error && typeof error.message === "string" && /terminated|aborted/i.test(error.message);
    if (!isRecoverable || !result.content) {
      logger?.error("qwen stream error", { message: error.message });
      throw error;
    }
    result.truncated = true;
    logger?.warn("qwen stream terminated after partial data", { contentLength: result.content.length });
  }

  if (!result.sawFinish && result.content) {
    result.truncated = true;
    logger?.warn("qwen stream ended without finish marker", { contentLength: result.content.length });
  }

  logger?.info("qwen: message completed", {
    contentLength: result.content.length,
    reasoningLength: result.reasoning.length,
    finishReason: result.finishReason,
    truncated: result.truncated,
  });

  return result;
}

async function executeQwen(model, promptText, onEvent, context = {}) {
  const logger = context.logger;
  const shouldStop = typeof context.shouldStop === "function" ? context.shouldStop : null;

  let account = null;
  let token = null;
  let chatId = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      account = nextAccount();
      token = await ensureAuthToken(account, logger);
      chatId = await createChat(token, model.upstreamId, logger);

      const result = await sendMessage(
        token, chatId, model.upstreamId, promptText, null,
        logger, onEvent, shouldStop
      );

      return result;
    } catch (error) {
      logger?.warn("qwen attempt failed", {
        attempt: attempt + 1,
        email: account?.email,
        message: error.message,
      });

      if (error.status === 401 || error.status === 403) {
        if (account) account.auth_token = null;
      }

      if (attempt >= 2) throw error;

      await new Promise((r) => setTimeout(r, 500 + attempt * 500));
    }
  }
}

module.exports = {
  DEFAULT_MODEL,
  executeQwen,
};
