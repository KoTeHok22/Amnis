import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Generator, List, Optional

from database import SessionLocal
from models import Chat as ChatModel, User as UserModel
from openai_api import OpenAIAPIError, OpenAIChatClient


class AIChatService:
    """Сервис для управления чатами с OpenAI-совместимым API."""

    def __init__(self):
        """Инициализирует сервис чата и локальное хранилище состояний."""
        self.user_data_dir = os.getenv("USER_DATA_DIR", "./user_chats")
        self.api_client = OpenAIChatClient()
        os.makedirs(self.user_data_dir, exist_ok=True)
        self.initial_prompt = self._load_initial_prompt()

    def _load_initial_prompt(self) -> str:
        """Загружает системный промпт из файла.
        Returns:
            str: Системный промпт для ИИ ассистента
        """
        try:
            prompt_path = os.path.join("prompts", "initial_prompt.txt")
            with open(prompt_path, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except FileNotFoundError:
            return "Вы - Amnis, хранитель тайн сновидений. Помогайте пользователям анализировать их сны, раскрывая символы и подсознательные сообщения."

    def _build_system_prompt(self, user: UserModel, initial_prompt: Optional[str] = None) -> str:
        previous_chats = sorted(
            user.chats or [],
            key=lambda chat: chat.created_at or datetime.min,
        )
        previous_summaries = [chat.dream_summary for chat in previous_chats if chat.dream_summary]
        previous_summaries_text = "\n".join(f"- {summary}" for summary in previous_summaries[-5:])

        prompt_template = initial_prompt or self.initial_prompt
        prompt = prompt_template.replace("[User's Name]", user.name or "Пользователь")
        prompt = prompt.replace(
            "[User's Date of Birth]",
            user.birth_date.strftime("%Y-%m-%d") if user.birth_date else "не указана",
        )
        prompt = prompt.replace("[Integer]", str(user.available_analyses or 0))
        prompt = prompt.replace("[Price]", "499₽")
        prompt = prompt.replace("[List]", previous_summaries_text or "Нет предыдущих анализов.")
        return prompt

    def _get_user_chat_file(self, user_phone: str, chat_id: str = None) -> str:
        """Возвращает путь к файлу чата пользователя.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата (если None, возвращает путь к файлу текущего чата)
        Returns:
            str: Путь к файлу чата пользователя
        """
        user_dir = os.path.join(self.user_data_dir, user_phone)
        os.makedirs(user_dir, exist_ok=True)
        if chat_id:
            return os.path.join(user_dir, f"{chat_id}.json")
        else:
            return os.path.join(user_dir, "current_chat.json")
    def _load_user_chat_state(self, user_phone: str, chat_id: str = None) -> Optional[Dict[str, Any]]:
        """Загружает состояние чата пользователя из файла.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата (если None, используется текущий чат)
        Returns:
            Optional[Dict[str, Any]]: Состояние чата или None, если файл не найден
        """
        file_path = self._get_user_chat_file(user_phone, chat_id)
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                pass
        return None
    def _save_user_chat_state(self, user_phone: str, chat_state: Dict[str, Any], chat_id: str = None) -> None:
        """Сохраняет состояние чата пользователя в файл.
        Args:
            user_phone: Номер телефона пользователя
            chat_state: Состояние чата для сохранения
            chat_id: Идентификатор чата (если None, используется файл текущего чата)
        """
        file_path = self._get_user_chat_file(user_phone, chat_id)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(chat_state, f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass
    def _get_current_chat_id(self, user_phone: str) -> Optional[str]:
        """Получает идентификатор текущего чата пользователя.
        Args:
            user_phone: Номер телефона пользователя
        Returns:
            Optional[str]: Идентификатор текущего чата или None, если файл не найден
        """
        current_chat_file = self._get_user_chat_file(user_phone)
        if os.path.exists(current_chat_file):
            try:
                with open(current_chat_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get("current_chat_id")
            except Exception as e:
                pass
        return None
    def _set_current_chat_id(self, user_phone: str, chat_id: str) -> None:
        """Устанавливает текущий идентификатор чата для пользователя."""
        current_chat_file = self._get_user_chat_file(user_phone)
        try:
            with open(current_chat_file, 'w', encoding='utf-8') as f:
                json.dump({"current_chat_id": chat_id}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass
    def create_chat(self, user_phone: str, title: str = "Dream Analysis Chat", initial_prompt: str = None) -> Dict[str, Any]:
        """Создает новый чат для пользователя.
        Args:
            user_phone: Номер телефона пользователя
            title: Заголовок чата (по умолчанию "Dream Analysis Chat")
            initial_prompt: Начальный промпт для чата (по умолчанию используется системный промпт)
        Returns:
            Dict[str, Any]: Информация о созданном чате
        """
        db = SessionLocal()
        try:
            user = db.query(UserModel).filter(UserModel.phone_number == user_phone).first()
            if not user:
                raise OpenAIAPIError(f"User with phone {user_phone} not found")

            system_message = {
                "role": "system",
                "content": self._build_system_prompt(user, initial_prompt),
                "timestamp": datetime.utcnow().isoformat(),
            }
            chat_state = self.api_client.create_chat(title=title, initial_messages=[system_message])
            chat_id = chat_state["chat_id"]

            self._save_user_chat_state(user_phone, chat_state, chat_id)
            self._set_current_chat_id(user_phone, chat_id)
            self._save_chat_to_db(user_phone, chat_id, title)
            return {
                "chat_id": chat_id,
                "title": title,
                "status": "created"
            }
        except OpenAIAPIError:
            raise
        except Exception as e:
            db.rollback()
            raise OpenAIAPIError(f"Ошибка при создании чата: {str(e)}")
        finally:
            db.close()

    def _save_chat_to_db(self, user_phone: str, chat_id: str, title: str) -> None:
        """Сохраняет информацию о чате в базу данных.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата
            title: Заголовок чата
        """
        db = SessionLocal()
        try:
            user = db.query(UserModel).filter(UserModel.phone_number == user_phone).first()
            if not user:
                raise Exception(f"User with phone {user_phone} not found")
            existing_chat = db.query(ChatModel).filter(ChatModel.chat_id == chat_id).first()
            if existing_chat:
                existing_chat.title = title
                existing_chat.updated_at = datetime.utcnow()
                existing_chat.is_active = True
            else:
                chat = ChatModel(
                    user_id=user.id,
                    chat_id=chat_id,
                    title=title,
                    is_active=True
                )
                db.add(chat)
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()
    def load_chat_state(self, user_phone: str, chat_id: str) -> Optional[Dict[str, Any]]:
        """Загружает состояние чата из базы данных и файловой системы.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата
        Returns:
            Optional[Dict[str, Any]]: Состояние чата или None в случае ошибки
        """
        db = SessionLocal()
        try:
            user = db.query(UserModel).filter(UserModel.phone_number == user_phone).first()
            if not user:
                return None
            chat_record = db.query(ChatModel).filter(
                ChatModel.chat_id == chat_id,
                ChatModel.user_id == user.id,
                ChatModel.is_active == True
            ).first()
            if not chat_record:
                return None
            chat_state = self._load_user_chat_state(user_phone, chat_id)
            return chat_state
        except Exception as e:
            return None
        finally:
            db.close()
    def get_messages_for_chat(self, user_phone: str, chat_id: str) -> Optional[List[Dict[str, Any]]]:
        """Получает сообщения для указанного чата.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата
        Returns:
            Optional[List[Dict[str, Any]]]: Список сообщений или None в случае ошибки
        """
        try:
            chat_state = self._load_user_chat_state(user_phone, chat_id)
            if not chat_state:
                return None
            return chat_state.get("messages", [])
        except Exception as e:
            return None
    def update_current_chat(self, user_phone: str, chat_id: str) -> bool:
        """Обновляет текущий чат для пользователя.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата
        Returns:
            bool: True в случае успеха, иначе False
        """
        try:
            chat_state = self._load_user_chat_state(user_phone, chat_id)
            if chat_state:
                self._set_current_chat_id(user_phone, chat_id)
                return True
            else:
                return False
        except Exception as e:
            return False
    def send_message(self, user_phone: str, message: str) -> Generator[Dict[str, Any], None, None]:
        """Отправляет сообщение в текущий чат и генерирует ответ от ИИ.
        Args:
            user_phone: Номер телефона пользователя
            message: Текст сообщения
        Yields:
            Dict[str, Any]: Ответ от ИИ по частям
        """
        db = SessionLocal()
        try:
            current_chat_id = self._get_current_chat_id(user_phone)
            if not current_chat_id:
                raise OpenAIAPIError("No active chat found for user.")
            chat_state = self._load_user_chat_state(user_phone, current_chat_id)
            if not chat_state:
                raise OpenAIAPIError(f"Failed to load chat state for chat_id: {current_chat_id}")

            messages_history = chat_state.get("messages", [])
            user_message = {
                "role": "user",
                "content": message,
                "timestamp": datetime.utcnow().isoformat()
            }
            messages_history.append(user_message)
            chat_state["messages"] = messages_history

            stream = self.api_client.send_message(chat_state=chat_state, prompt=message)
            full_response = ""

            answer_content = ""
            for event in stream:

                choices = event.get("choices") or []
                if not choices:
                    continue

                delta = choices[0].get("delta") or {}
                content = delta.get("content", "")

                if isinstance(content, list):
                    content = "".join(
                        part.get("text", "")
                        for part in content
                        if isinstance(part, dict)
                    )

                if content:
                    full_response += content
                    answer_content += content
                    yield {
                        "type": "stream",
                        "content": content,
                        "phase": "answer",
                    }

            name_change_match = re.search(r'\[NAME_CHANGE\s*=\s*["\']([^"\']+)["\']\]', full_response)
            if name_change_match:
                new_title = name_change_match.group(1)
                chat_record = db.query(ChatModel).filter(ChatModel.chat_id == current_chat_id).first()
                if chat_record:
                    chat_record.title = new_title
                    db.commit()

            symbols_match = re.search(r'\[SYMBOLS\s*=\s*["\']([^"\']+)["\']\]', full_response)
            if symbols_match:
                summary = symbols_match.group(1)
                chat_record = db.query(ChatModel).filter(ChatModel.chat_id == current_chat_id).first()
                if chat_record:
                    chat_record.dream_summary = summary
                    db.commit()

            if answer_content:
                assistant_message = {
                    "role": "assistant",
                    "content": answer_content,
                    "timestamp": datetime.utcnow().isoformat(),
                }
                messages_history.append(assistant_message)

            chat_state["messages"] = messages_history
            self._save_user_chat_state(user_phone, chat_state, current_chat_id)
            yield {
                "type": "complete",
                "content": answer_content,
            }
        except OpenAIAPIError:
            db.rollback()
            raise
        except Exception as e:
            db.rollback()
            raise OpenAIAPIError(f"Ошибка при отправке сообщения: {str(e)}")
        finally:
            db.close()

    def get_user_chats(self, user_phone: str) -> List[Dict[str, Any]]:
        """Получает список чатов пользователя из базы данных.
        Args:
            user_phone: Номер телефона пользователя
        Returns:
            List[Dict[str, Any]]: Список чатов пользователя
        """
        db = SessionLocal()
        try:
            user = db.query(UserModel).filter(UserModel.phone_number == user_phone).first()
            if not user:
                raise Exception(f"User with phone {user_phone} not found")
            user_chats_db = db.query(ChatModel).filter(
                ChatModel.user_id == user.id,
                ChatModel.is_active == True
            ).order_by(ChatModel.updated_at.desc()).all()
            chats_list = []
            for chat in user_chats_db:
                chats_list.append({
                    "id": chat.chat_id,
                    "title": chat.title,
                    "created_at": chat.created_at.isoformat() if chat.created_at else None,
                    "updated_at": chat.updated_at.isoformat() if chat.updated_at else None
                })
            return chats_list
        except Exception as e:
            raise e
        finally:
            db.close()

    def clear_chat(self, user_phone: str) -> bool:
        """Очищает текущий чат пользователя.
        Args:
            user_phone: Номер телефона пользователя
        Returns:
            bool: True в случае успеха, иначе False
        """
        try:
            current_chat_id = self._get_current_chat_id(user_phone)
            if not current_chat_id:
                return True

            chat_state = self._load_user_chat_state(user_phone, current_chat_id)
            if not chat_state:
                return False

            system_messages = [
                message
                for message in chat_state.get("messages", [])
                if message.get("role") == "system"
            ]
            chat_state["messages"] = system_messages
            self._save_user_chat_state(user_phone, chat_state, current_chat_id)
            return True
        except Exception as e:
            return False

    def deactivate_chat(self, user_phone: str, chat_id: str) -> bool:
        """Деактивирует указанный чат пользователя.
        Args:
            user_phone: Номер телефона пользователя
            chat_id: Идентификатор чата
        Returns:
            bool: True в случае успеха, иначе False
        """
        db = SessionLocal()
        try:
            user = db.query(UserModel).filter(UserModel.phone_number == user_phone).first()
            if not user:
                return False
            chat = db.query(ChatModel).filter(
                ChatModel.chat_id == chat_id,
                ChatModel.user_id == user.id
            ).first()
            if chat:
                chat.is_active = False
                chat.updated_at = datetime.utcnow()
                db.commit()
                chat_file_path = self._get_user_chat_file(user_phone, chat_id)
                if os.path.exists(chat_file_path):
                    os.remove(chat_file_path)
                return True
            return False
        except Exception as e:
            db.rollback()
            return False
        finally:
            db.close()


ai_chat_service = AIChatService()