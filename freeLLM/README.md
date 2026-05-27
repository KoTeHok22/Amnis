# Qwen OpenAI-Compatible Adapter

This project exposes an OpenAI-compatible API backed by the free Qwen AI service at chat.qwen.ai.

Purpose:

- provide free access to Qwen models through a standard OpenAI-compatible API;
- avoid exposing tool-calling in this adapter;
- avoid surfacing reasoning blocks back into OpenAI-compatible clients.

Endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /health`

Run:

```bash
node server.js
```

Useful diagnostics:

```bash
LOG_LEVEL=DEBUG LOG_BODIES=1 LOG_STREAM_EVENTS=1 node server.js
```

Windows `cmd.exe`:

```bat
set LOG_LEVEL=DEBUG && set LOG_BODIES=1 && set LOG_STREAM_EVENTS=1 && node server.js
```

Windows PowerShell:

```powershell
$env:LOG_LEVEL="DEBUG"; $env:LOG_BODIES="1"; $env:LOG_STREAM_EVENTS="1"; node server.js
```

Shortcut:

```bat
start-debug.cmd
```

Default address:

```text
http://127.0.0.1:11434
```

Recommended OpenAI-compatible base URL:

```text
http://127.0.0.1:11434/v1
```

Available model:

```text
qwen3.6-plus
```

Example:

```bash
curl http://127.0.0.1:11434/v1/models
```

```bash
curl http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.6-plus",
    "messages": [
      { "role": "user", "content": "Reply with exactly OK" }
    ]
  }'
```

```bash
curl http://127.0.0.1:11434/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.6-plus",
    "input": [
      { "role": "user", "content": [{ "type": "input_text", "text": "Reply with exactly OK" }] }
    ]
  }'
```

Streaming is supported with `"stream": true`.

OpenCode notes:

- The adapter is optimized for general chat and coding advice.
- The adapter rejects `tools` and `tool_choice` with `400`.
- The adapter does not emit `tool_calls`, `function_call`, or `reasoning_content` blocks.
- `responses` streaming emits `response.created`, `response.output_text.delta`, `response.output_item.done`, and `response.completed`.
- `chat.completions` streaming includes `usage` chunks when `stream_options.include_usage` is requested.

Example OpenCode config:

- `opencode.jsonc`

Diagnostics:

- Every request gets `X-Request-Id` in the response.
- `LOG_LEVEL=DEBUG` enables route and upstream lifecycle logs.
- `LOG_BODIES=1` enables request body and upstream payload logging.
- `LOG_STREAM_EVENTS=1` enables parsed upstream SSE event logging.
- The adapter always sets `X-Adapter: qwen-openai-adapter`.

Notes:

- No API key is required by this adapter.
- It forwards to the chat.qwen.ai API using accounts from `OLD/accounts.json`.
- `chat.completions` and `responses` are implemented.
- Message arrays are flattened into plain text before being sent upstream.
