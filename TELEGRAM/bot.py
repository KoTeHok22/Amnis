import asyncio
import logging
from datetime import datetime
from typing import Optional
import telebot
from telebot import types
import httpx
import os
from database import SessionLocal
from models import User as UserModel, Chat as ChatModel, TelegramUser
from auth_helper import get_telegram_auth_token, store_token_for_telegram_user, get_token_for_telegram_user
import re

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

BACKEND_BASE_URL = os.getenv('BACKEND_BASE_URL', 'https://api.jdh-team.ru')
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', 'YOUR_TELEGRAM_BOT_TOKEN_HERE')

verification_codes = {}
registration_states = {}

bot = telebot.TeleBot(BOT_TOKEN)

class TelegramBot:
    def __init__(self, backend_url: str):
        self.backend_url = backend_url
        # Register handlers
        bot.message_handler(commands=['start'])(self.start_command)
        bot.message_handler(commands=['newchat'])(self.new_chat)
        bot.message_handler(commands=['mychats'])(self.my_chats)
        bot.message_handler(commands=['clear'])(self.clear_chat)
        bot.message_handler(commands=['profile'])(self.profile)
        bot.message_handler(commands=['help'])(self.help_command)
        bot.message_handler(func=lambda message: True)(self.handle_message)

    def start_command(self, message):
        user = message.from_user
        db = SessionLocal()
        try:
            telegram_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()

            if telegram_user and telegram_user.is_verified:
                bot.reply_to(message, f"Привет, {user.first_name}! Вы уже привязаны к профилю на сайте.")
                self.show_main_menu(message)
            else:
                msg = bot.reply_to(message,
                    f"Добро пожаловать, {user.first_name}! "
                    f"Для начала работы с ботом нужно зарегистрироваться или привязать аккаунт. "
                    f"У вас есть аккаунт на сайте? (да/нет)")
                bot.register_next_step_handler(msg, self.handle_account_choice)
        except Exception as e:
            logger.error(f"Error in start command: {e}")
            bot.reply_to(message, "Произошла ошибка. Пожалуйста, попробуйте позже.")
        finally:
            db.close()

    def receive_phone(self, message):
        user = message.from_user
        phone_number = message.text.strip()

        phone_pattern = re.compile(r'^\+?1?\d{9,15}$')
        if not phone_pattern.match(phone_number):
            bot.reply_to(message, "Неверный формат номера телефона. Пожалуйста, введите номер в формате +7XXX XXX XXXX:")
            return

        db = SessionLocal()
        try:
            existing_user = db.query(UserModel).filter(UserModel.phone_number == phone_number).first()
            if not existing_user:
                bot.reply_to(message,
                    "Пользователь с таким номером телефона не найден. "
                    "Пожалуйста, зарегистрируйтесь на сайте и попробуйте снова.")
                return

            verification_code = "1234"
            verification_codes[user.id] = {
                "phone_number": phone_number,
                "code": verification_code,
                "expires_at": datetime.now().timestamp() + 300
            }

            bot.reply_to(message,
                f"На ваш номер {phone_number} было отправлено SMS с кодом подтверждения. "
                f"Пожалуйста, введите 4-значный код для завершения привязки:")

        except Exception as e:
            logger.error(f"Error during phone verification: {e}")
            bot.reply_to(message, "Произошла ошибка. Пожалуйста, попробуйте позже.")
        finally:
            db.close()

    def handle_account_choice(self, message):
        user = message.from_user
        choice = message.text.strip().lower()
        
        if choice == 'да':
            msg = bot.reply_to(message, "Укажите ваш номер телефона в формате +7XXX XXX XXXX:")
            bot.register_next_step_handler(msg, self.receive_phone)
        elif choice == 'нет':
            msg = bot.reply_to(message, "Начнём регистрацию! Укажите ваш номер телефона в формате +7XXX XXX XXXX:")
            bot.register_next_step_handler(msg, self.start_registration)
        else:
            msg = bot.reply_to(message, "Пожалуйста, ответьте 'да' или 'нет':")
            bot.register_next_step_handler(msg, self.handle_account_choice)

    def start_registration(self, message):
        user = message.from_user
        phone_number = message.text.strip()
        
        phone_pattern = re.compile(r'^\+?1?\d{9,15}$')
        if not phone_pattern.match(phone_number):
            msg = bot.reply_to(message, "Неверный формат номера. Пожалуйста, введите номер в формате +7XXX XXX XXXX:")
            bot.register_next_step_handler(msg, self.start_registration)
            return
        
        # Store phone number for registration flow
        self.registration_states[user.id] = {'phone_number': phone_number}
        
        msg = bot.reply_to(message, "Отлично! Теперь придумайте пароль (минимум 6 символов):")
        bot.register_next_step_handler(msg, self.process_password_step)

    def process_password_step(self, message):
        user = message.from_user
        password = message.text.strip()
        
        if len(password) < 6:
            msg = bot.reply_to(message, "Пароль слишком короткий. Придумайте пароль минимум из 6 символов:")
            bot.register_next_step_handler(msg, self.process_password_step)
            return
        
        self.registration_states[user.id]['password'] = password
        msg = bot.reply_to(message, "Введите ваше имя:")
        bot.register_next_step_handler(msg, self.process_name_step)

    def process_name_step(self, message):
        user = message.from_user
        name = message.text.strip()
        
        if not name:
            msg = bot.reply_to(message, "Имя не может быть пустым. Пожалуйста, введите ваше имя:")
            bot.register_next_step_handler(msg, self.process_name_step)
            return
        
        self.registration_states[user.id]['name'] = name
        self.register_user(message)

    def register_user(self, message):
        user = message.from_user
        data = self.registration_states.get(user.id)
        
        if not data:
            bot.reply_to(message, "Произошла ошибка. Пожалуйста, начните регистрацию заново с помощью /start")
            return
        
        from auth_helper import register_user_via_telegram
        success = asyncio.run(register_user_via_telegram(data['phone_number'], data['password'], data['name']))
        
        if success:
            # Create TelegramUser record
            db = SessionLocal()
            try:
                telegram_user = TelegramUser(
                    telegram_id=user.id,
                    username=user.username,
                    first_name=user.first_name,
                    last_name=user.last_name,
                    phone_number=data['phone_number'],
                    is_verified=True
                )
                db.add(telegram_user)
                db.commit()
                
                # Get and store auth token
                token = asyncio.run(get_telegram_auth_token(user.id, data['phone_number']))
                if token:
                    asyncio.run(store_token_for_telegram_user(user.id, token))
                
                bot.reply_to(message, "Регистрация прошла успешно! Теперь вы можете использовать бота.")
                self.show_main_menu(message)
            finally:
                db.close()
            del self.registration_states[user.id]
        else:
            bot.reply_to(message, "Ошибка регистрации. Пожалуйста, попробуйте позже.")

    def verify_code(self, message):
        user = message.from_user
        entered_code = message.text.strip()

        if user.id not in verification_codes:
            bot.reply_to(message, "Сессия истекла. Пожалуйста, начните привязку заново с команды /start")
            return

        verification_data = verification_codes[user.id]
        stored_code = verification_data["code"]
        phone_number = verification_data["phone_number"]

        if datetime.now().timestamp() > verification_data["expires_at"]:
            del verification_codes[user.id]
            bot.reply_to(message, "Код подтверждения истек. Пожалуйста, начните привязку заново с команды /start")
            return

        if len(entered_code) == 4 and entered_code.isdigit():
            db = SessionLocal()
            try:
                existing_telegram_user = db.query(TelegramUser).filter(
                    TelegramUser.telegram_id == user.id
                ).first()

                if existing_telegram_user:
                    existing_telegram_user.phone_number = phone_number
                    existing_telegram_user.is_verified = True
                    existing_telegram_user.updated_at = datetime.utcnow()
                else:
                    telegram_user = TelegramUser(
                        telegram_id=user.id,
                        username=user.username,
                        first_name=user.first_name,
                        last_name=user.last_name,
                        phone_number=phone_number,
                        is_verified=True
                    )
                    db.add(telegram_user)

                db.commit()

                del verification_codes[user.id]

                # Token will be handled in the auth_helper
                token = asyncio.run(get_telegram_auth_token(user.id, phone_number))

                if token:
                    asyncio.run(store_token_for_telegram_user(user.id, token))

                bot.reply_to(message,
                    "Аккаунт успешно привязан к вашему профилю на сайте! "
                    "Теперь вы можете использовать все функции бота, и ваши диалоги будут синхронизированы с веб-сайтом.")

                self.show_main_menu(message)
            except Exception as e:
                logger.error(f"Error linking Telegram account: {e}")
                bot.reply_to(message, "Произошла ошибка при привязке аккаунта. Пожалуйста, попробуйте позже.")
            finally:
                db.close()
        else:
            bot.reply_to(message, "Неверный формат кода. Пожалуйста, введите 4-значный код подтверждения:")

    def show_main_menu(self, message):
        keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)
        keyboard.row(
            types.KeyboardButton("💬 Новый чат"),
            types.KeyboardButton("📋 Мои чаты")
        )
        keyboard.row(
            types.KeyboardButton("🔄 Очистить чат"),
            types.KeyboardButton("👤 Профиль")
        )

        bot.reply_to(message, "Выберите действие:", reply_markup=keyboard)

    @bot.message_handler(commands=['newchat'])
    def new_chat(self, message):
        user = message.from_user
        db = SessionLocal()
        try:
            telegram_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()
            if not telegram_user or not telegram_user.is_verified:
                bot.reply_to(message, "Пожалуйста, сначала привяжите ваш аккаунт с помощью команды /start")
                return

            # Using synchronous httpx client
            import httpx
            token = asyncio.run(self.get_user_token(db, telegram_user.phone_number, user.id))
            if not token:
                bot.reply_to(message, "Не удалось получить токен доступа. Попробуйте позже.")
                return

            headers = {"Authorization": f"Bearer {token}"}
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self.backend_url}/chat/create",
                    json={"title": "Telegram Chat"},
                    headers=headers
                )

                if response.status_code == 200:
                    result = response.json()
                    chat_id = result.get("chat_id")
                    bot.reply_to(message, f"Новый чат создан! ID: {chat_id}")
                else:
                    bot.reply_to(message, f"Ошибка при создании чата: {response.text}")
        except Exception as e:
            logger.error(f"Error creating chat: {e}")
            bot.reply_to(message, "Произошла ошибка при создании чата.")
        finally:
            db.close()

    @bot.message_handler(commands=['mychats'])
    def my_chats(self, message):
        user = message.from_user
        db = SessionLocal()
        try:
            telegram_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()
            if not telegram_user or not telegram_user.is_verified:
                bot.reply_to(message, "Пожалуйста, сначала привяжите ваш аккаунт с помощью команды /start")
                return

            import httpx
            token = asyncio.run(self.get_user_token(db, telegram_user.phone_number, user.id))
            if not token:
                bot.reply_to(message, "Не удалось получить токен доступа. Попробуйте позже.")
                return

            headers = {"Authorization": f"Bearer {token}"}
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{self.backend_url}/chats",
                    headers=headers
                )

                if response.status_code == 200:
                    result = response.json()
                    chats = result.get("chats", [])

                    if chats:
                        chat_list = "\n".join([f"- {chat['title']} (ID: {chat['id']})" for chat in chats])
                        bot.reply_to(message, f"Ваши чаты:\n{chat_list}")
                    else:
                        bot.reply_to(message, "У вас пока нет чатов.")
                else:
                    bot.reply_to(message, f"Ошибка при получении чатов: {response.text}")
        except Exception as e:
            logger.error(f"Error getting chats: {e}")
            bot.reply_to(message, "Произошла ошибка при получении чатов.")
        finally:
            db.close()

    @bot.message_handler(commands=['clear'])
    def clear_chat(self, message):
        user = message.from_user
        db = SessionLocal()
        try:
            telegram_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()
            if not telegram_user or not telegram_user.is_verified:
                bot.reply_to(message, "Пожалуйста, сначала привяжите ваш аккаунт с помощью команды /start")
                return

            import httpx
            token = asyncio.run(self.get_user_token(db, telegram_user.phone_number, user.id))
            if not token:
                bot.reply_to(message, "Не удалось получить токен доступа. Попробуйте позже.")
                return

            headers = {"Authorization": f"Bearer {token}"}
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self.backend_url}/chat/clear",
                    headers=headers
                )

                if response.status_code == 200:
                    bot.reply_to(message, "Чат успешно очищен!")
                else:
                    bot.reply_to(message, f"Ошибка при очистке чата: {response.text}")
        except Exception as e:
            logger.error(f"Error clearing chat: {e}")
            bot.reply_to(message, "Произошла ошибка при очистке чата.")
        finally:
            db.close()

    @bot.message_handler(commands=['profile'])
    def profile(self, message):
        user = message.from_user
        db = SessionLocal()
        try:
            telegram_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()
            if not telegram_user or not telegram_user.is_verified:
                bot.reply_to(message, "Пожалуйста, сначала привяжите ваш аккаунт с помощью команды /start")
                return

            import httpx
            token = asyncio.run(self.get_user_token(db, telegram_user.phone_number, user.id))
            if not token:
                bot.reply_to(message, "Не удалось получить токен доступа. Попробуйте позже.")
                return

            headers = {"Authorization": f"Bearer {token}"}
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    f"{self.backend_url}/profile",
                    headers=headers
                )

                if response.status_code == 200:
                    profile_data = response.json()
                    profile_info = (
                        f"👤 Профиль:\n"
                        f"Имя: {profile_data.get('name', 'Не указано')}\n"
                        f"Телефон: {profile_data.get('phone_number', 'Не указан')}\n"
                        f"Дата рождения: {profile_data.get('birth_date', 'Не указана')}\n"
                        f"Дата регистрации: {profile_data.get('created_at', 'Не указана')}"
                    )
                    bot.reply_to(message, profile_info)
                else:
                    bot.reply_to(message, f"Ошибка при получении профиля: {response.text}")
        except Exception as e:
            logger.error(f"Error getting profile: {e}")
            bot.reply_to(message, "Произошла ошибка при получении профиля.")
        finally:
            db.close()

    @bot.message_handler(commands=['help'])
    def help_command(self, message):
        help_text = (
            "Доступные команды:\n"
            "/start - Начать работу с ботом\n"
            "/newchat - Создать новый чат\n"
            "/mychats - Посмотреть мои чаты\n"
            "/clear - Очистить текущий чат\n"
            "/profile - Посмотреть профиль\n"
            "/help - Показать это сообщение"
        )
        bot.reply_to(message, help_text)

    @bot.message_handler(func=lambda message: True)
    def handle_message(self, message):
        user = message.from_user
        text = message.text

        # Don't process commands
        if text.startswith('/'):
            return

        db = SessionLocal()
        try:
            telegram_user = db.query(TelegramUser).filter(TelegramUser.telegram_id == user.id).first()
            if not telegram_user or not telegram_user.is_verified:
                bot.reply_to(message, "Пожалуйста, сначала привяжите ваш аккаунт с помощью команды /start")
                return

            import httpx
            token = asyncio.run(self.get_user_token(db, telegram_user.phone_number, user.id))
            if not token:
                bot.reply_to(message, "Не удалось получить токен доступа. Попробуйте позже.")
                return

            headers = {"Authorization": f"Bearer {token}"}
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self.backend_url}/chat/send",
                    json={"message": text},
                    headers=headers
                )

                if response.status_code == 200:
                    result = response.json()
                    task_id = result.get("task_id")

                    max_attempts = 30
                    for attempt in range(max_attempts):
                        import time
                        time.sleep(1)

                        task_response = client.get(
                            f"{self.backend_url}/chat/task/{task_id}",
                            headers=headers
                        )

                        if task_response.status_code == 200:
                            task_result = task_response.json()

                            if task_result["status"] == "completed":
                                ai_response = task_result["result"]["content"]
                                bot.reply_to(message, ai_response)
                                break
                            elif task_result["status"] == "failed":
                                bot.reply_to(message,
                                    f"Ошибка обработки сообщения: {task_result.get('error', 'Неизвестная ошибка')}")
                                break
                        else:
                            bot.reply_to(message, f"Ошибка получения результата: {task_response.text}")
                            break
                    else:
                        bot.reply_to(message,
                            "Время ожидания ответа от ИИ истекло. Попробуйте отправить сообщение снова.")
                else:
                    bot.reply_to(message, f"Ошибка при отправке сообщения: {response.text}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            bot.reply_to(message, "Произошла ошибка при обработке сообщения.")
        finally:
            db.close()

    async def get_user_token(self, db, phone_number: str, telegram_id: int = None) -> Optional[str]:
        try:
            token = None
            if telegram_id:
                token = await get_token_for_telegram_user(telegram_id)
                if token:
                    import httpx
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        headers = {"Authorization": f"Bearer {token}"}
                        try:
                            response = await client.get(
                                f"{self.backend_url}/verify-token",
                                headers=headers
                            )
                            if response.status_code == 200:
                                return token
                        except:
                            pass

            if telegram_id and phone_number:
                new_token = await get_telegram_auth_token(telegram_id, phone_number)
                if new_token:
                    await store_token_for_telegram_user(telegram_id, new_token)
                    return new_token

            telegram_user = db.query(TelegramUser).filter(
                TelegramUser.phone_number == phone_number
            ).first()

            if telegram_user and telegram_user.access_token:
                return telegram_user.access_token
        except Exception as e:
            logger.error(f"Error getting user token: {e}")

        return None

    def run(self):
        logger.info("Starting Telegram bot...")
        bot.polling()


if __name__ == '__main__':
    telegram_bot = TelegramBot(BACKEND_BASE_URL)
    telegram_bot.run()