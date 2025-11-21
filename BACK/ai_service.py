import re
import os
import json
from typing import Dict, Any, Optional, Generator, List
from datetime import datetime
from qwen_api import QwenAPIClient, AccountManager, CookieManager, QwenAPIError
from models import Chat as ChatModel, User as UserModel
from database import SessionLocal
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
class AIChatService:
    """Сервис для управления чатами с ИИ-агента Qwen."""
    def __init__(self):
        """Инициализирует сервис чата с ИИ.
        Устанавливает пути к файлам аккаунтов, куки и пользовательских данных,
        создает менеджеры аккаунтов и куки, инициализирует клиент API,
        создает директорию для пользовательских данных и загружает начальный промпт.
        """
        self.accounts_file = os.getenv("ACCOUNTS_FILE", "accounts.json")
        self.cookies_file = os.getenv("COOKIES_FILE", "cookies.json")
        self.user_data_dir = os.getenv("USER_DATA_DIR", "./user_chats")
        self.account_manager = None
        self.cookie_manager = None
        self.api_client = None
        self._initialize_client()
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
    def split_text(self, text, chunk_size=4000):
        """Разделяет текст на части заданного размера, сохраняя целостность кодовых блоков.
        Args:
            text: Текст для разделения
            chunk_size: Максимальный размер части (по умолчанию 4000)
        Returns:
            list: Список частей текста
        """
        chunks = []
        current_chunk = ""
        lines = text.split('\n')
        in_code_block = False
        code_language = None
        for line in lines:
            if line.strip().startswith("```"):
                if not in_code_block:
                    code_language = line.strip().split("```")[-1].strip()
                in_code_block = not in_code_block
            if len(current_chunk) + len(line) + 1 > chunk_size:
                if in_code_block:
                    current_chunk += "```\n"
                    chunks.append(current_chunk.strip())
                    current_chunk = f"```{code_language}\n"
                else:
                    chunks.append(current_chunk.strip())
                    current_chunk = line + "\n"
            else:
                current_chunk += line + "\n"
        if current_chunk:
            if in_code_block:
                current_chunk += "```\n"
            chunks.append(current_chunk.strip())
        return chunks
    def escape_special_chars(self, text):
        """Экранирует специальные символы в тексте, за исключением кодовых блоков.
        Args:
            text: Текст для экранирования символов
        Returns:
            str: Текст с экранированными символами
        """
        special_chars = ['_', '*', '[', ']', '(', ')', '~', '>', '`']
        result = []
        i = 0
        in_code_block = False
        in_inline_code = False
        while i < len(text):
            if i + 2 < len(text) and text[i:i+3] == '```':
                in_code_block = not in_code_block
                result.append('```')
                i += 3
                continue
            if text[i] == '`' and not in_code_block:
                in_inline_code = not in_inline_code
                result.append('`')
                i += 1
                continue
            if not in_code_block and not in_inline_code:
                if text[i] == '\\':
                    result.append('\\\\')
                elif text[i] in special_chars:
                    result.append('\\' + text[i])
                else:
                    result.append(text[i])
            else:
                result.append(text[i])
            i += 1
        return ''.join(result)
    def _initialize_client(self):
        """Инициализирует клиент API Qwen с использованием менеджеров аккаунтов и куки.
        Raises:
            FileNotFoundError: Если файл аккаунтов не найден
        """
        try:
            if not os.path.exists(self.accounts_file):
                raise FileNotFoundError(f"Файл {self.accounts_file} не найден. Создайте файл с учетными данными Qwen.")
            self.account_manager = AccountManager(accounts_file_path=self.accounts_file)
            self.cookie_manager = CookieManager(cookie_file_path=self.cookies_file)
            self.api_client = QwenAPIClient(self.account_manager, self.cookie_manager)
        except Exception as e:
            raise
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
        Raises:
            QwenAPIError: Если произошла ошибка при создании чата
        """
        db = SessionLocal()
        try:
            user = db.query(UserModel).filter(UserModel.phone_number == user_phone).first()
            if not user:
                raise QwenAPIError(f"User with phone {user_phone} not found")
            previous_chats = db.query(ChatModel).filter(
                ChatModel.user_id == user.id,
                ChatModel.dream_summary.isnot(None)
            ).order_by(ChatModel.created_at.desc()).limit(5).all()
            previous_summaries = "\n".join(
                [f"- {chat.dream_summary}" for chat in previous_chats]
            ) if previous_chats else "Нет предыдущих анализов."
            available_analyses = user.available_analyses or 0
            price = "499₽"
            prompt_template = initial_prompt or self.initial_prompt
            populated_prompt = prompt_template.replace("[User's Name]", user.name or "Пользователь")
            populated_prompt = populated_prompt.replace("[User's Date of Birth]", user.birth_date.strftime('%Y-%m-%d') if user.birth_date else "не указана")
            populated_prompt = populated_prompt.replace("[Integer]", str(available_analyses))
            populated_prompt = populated_prompt.replace("[Price]", price)
            populated_prompt = populated_prompt.replace("[List]", previous_summaries)
            chat_state = self.api_client.create_chat(
                title=title,
                chat_type="search"
            )
            chat_id = chat_state["chat_id"]
            chat_state["messages"] = []
            self._save_user_chat_state(user_phone, chat_state, chat_id)
            self._set_current_chat_id(user_phone, chat_id)
            self._save_chat_to_db(user_phone, chat_id, title)
            stream = self.api_client.send_message(
                chat_state=chat_state,
                prompt=populated_prompt,
                chat_type="search",
                sub_chat_type="search"
            )
            for _ in stream:
                pass
            self._save_user_chat_state(user_phone, chat_state, chat_id)
            return {
                "chat_id": chat_id,
                "title": title,
                "status": "created"
            }
        except QwenAPIError as e:
            raise e
        except Exception as e:
            db.rollback()
            raise QwenAPIError(f"Ошибка при создании чата: {str(e)}")
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
                raise QwenAPIError("No active chat found for user.")
            chat_state = self._load_user_chat_state(user_phone, current_chat_id)
            if not chat_state:
                raise QwenAPIError(f"Failed to load chat state for chat_id: {current_chat_id}")
            messages_history = chat_state.get("messages", [])
            user_message = {
                "role": "user",
                "content": message,
                "timestamp": datetime.utcnow().isoformat()
            }
            messages_history.append(user_message)
            chat_state["messages"] = messages_history
            stream = self.api_client.send_message(
                chat_state=chat_state,
                prompt=message,
                chat_type="search",
                sub_chat_type="search"
            )
            full_response = ""
            answer_content = ""  # Track only the answer content to send to user
            for event in stream:
                if 'choices' in event and event['choices']:
                    content = event['choices'][0].get('delta', {}).get('content', '')
                    phase = event['choices'][0].get('delta', {}).get('phase', 'answer')  # Default to 'answer' if no phase specified

                    # Only yield content if it's part of the answer phase (not the think phase)
                    if phase == 'answer':
                        if content:
                            full_response += content
                            answer_content += content
                            yield {
                                "type": "stream",
                                "content": content,
                                "phase": phase
                            }
                    # Update the full response for think phase too, but don't yield it to user
                    elif phase == 'think' and content:
                        full_response += content
            cleaned_response = answer_content  # Use only the answer content for the final response
            name_change_match = re.search(r'\[NAME_CHANGE = "([^"]+)"\]', full_response)
            if name_change_match:
                new_title = name_change_match.group(1)
                chat_record = db.query(ChatModel).filter(ChatModel.chat_id == current_chat_id).first()
                if chat_record:
                    chat_record.title = new_title
                    db.commit()
                # Don't remove from answer_content since it was not added there
            symbols_match = re.search(r'\[SYMBOLS = "([^"]+)"\]', full_response)
            if symbols_match:
                summary = symbols_match.group(1)
                chat_record = db.query(ChatModel).filter(ChatModel.chat_id == current_chat_id).first()
                if chat_record:
                    chat_record.dream_summary = summary
                    db.commit()
                # Don't remove from answer_content since it was not added there
            if answer_content:
                assistant_message = {
                    "role": "assistant",
                    "content": answer_content,  # Store the clean answer content
                    "timestamp": datetime.utcnow().isoformat()
                }
                messages_history.append(assistant_message)
            chat_state["messages"] = messages_history
            self._save_user_chat_state(user_phone, chat_state, current_chat_id)
            yield {
                "type": "complete",
                "content": answer_content  # Send only the answer content to the frontend
            }
        except QwenAPIError as e:
            db.rollback()
            raise e
        except Exception as e:
            db.rollback()
            raise QwenAPIError(f"Ошибка при отправке сообщения: {str(e)}")
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
    def _get_last_assistant_message_id(self, chat_state: Dict[str, Any]) -> Optional[str]:
        """Получает идентификатор последнего сообщения от ассистента.
        Args:
            chat_state: Состояние чата
        Returns:
            Optional[str]: Идентификатор сообщения или None
        """
        return chat_state.get('last_message_id')
    def clear_chat(self, user_phone: str) -> bool:
        """Очищает текущий чат пользователя.
        Args:
            user_phone: Номер телефона пользователя
        Returns:
            bool: True в случае успеха, иначе False
        """
        try:
            current_chat_id = self._get_current_chat_id(user_phone)
            if current_chat_id:
                old_chat_state = self._load_user_chat_state(user_phone, current_chat_id)
                if old_chat_state and 'chat_id' in old_chat_state:
                    try:
                        self.api_client.delete_chat(old_chat_state)
                    except Exception as e:
                        pass
                file_path = self._get_user_chat_file(user_phone, current_chat_id)
                if os.path.exists(file_path):
                    os.remove(file_path)
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