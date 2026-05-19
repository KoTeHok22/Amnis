import json
import os
import uuid
from typing import Any, Dict, Generator, List, Optional

import httpx


class OpenAIAPIError(Exception):
    """Raised when the OpenAI-compatible API request fails."""


class OpenAIChatClient:
    """Minimal stateless client for an OpenAI-compatible chat completions API."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("OPENAI_BASE_URL", "https://flick-api.gleeze.com/v1")).rstrip("/")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_MODEL", "qwen-3.5")
        self.timeout = float(os.getenv("OPENAI_TIMEOUT", "300"))

        if not self.api_key:
            raise OpenAIAPIError("OPENAI_API_KEY is not configured.")

    def create_chat(
        self,
        title: str,
        initial_messages: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        return {
            "chat_id": str(uuid.uuid4()),
            "title": title,
            "messages": initial_messages or [],
        }

    def send_message(
        self,
        chat_state: Dict[str, Any],
        prompt: Optional[str] = None,
        file_paths: Optional[List[str]] = None,
        chat_type: str = "chat",
        sub_chat_type: str = "chat",
    ) -> Generator[Dict[str, Any], None, None]:
        del prompt, file_paths, chat_type, sub_chat_type

        payload = {
            "model": self.model,
            "messages": self._serialize_messages(chat_state.get("messages", [])),
            "stream": True,
        }

        if not payload["messages"]:
            raise OpenAIAPIError("Chat state does not contain any messages.")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        timeout = httpx.Timeout(self.timeout, connect=min(self.timeout, 30.0))

        try:
            with httpx.Client(timeout=timeout) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line:
                            continue

                        data = line.strip()
                        if not data.startswith("data:"):
                            continue

                        data = data[5:].strip()
                        if data == "[DONE]":
                            break

                        try:
                            yield json.loads(data)
                        except json.JSONDecodeError:
                            continue
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip()
            raise OpenAIAPIError(f"OpenAI-compatible API request failed: {detail}") from exc
        except httpx.HTTPError as exc:
            raise OpenAIAPIError(f"OpenAI-compatible API transport error: {exc}") from exc

    def delete_chat(self, chat_state: Dict[str, Any]) -> bool:
        del chat_state
        return True

    @staticmethod
    def _serialize_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        serialized_messages: List[Dict[str, str]] = []

        for message in messages:
            role = message.get("role")
            content = message.get("content")

            if role not in {"system", "user", "assistant"}:
                continue
            if not isinstance(content, str) or not content.strip():
                continue

            serialized_messages.append({
                "role": role,
                "content": content,
            })

        return serialized_messages