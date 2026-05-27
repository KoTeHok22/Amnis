import os
import json
import time
import uuid
import random
import threading
from queue import Queue
from typing import Dict, Any, Optional, Generator, List

import requests
import oss2
from playwright.sync_api import sync_playwright

class QwenAPIError(Exception):
    """Базовый класс для ошибок, связанных с Qwen API."""
    pass

class AuthenticationError(QwenAPIError):
    """Ошибка аутентификации (неверный токен, логин/пароль)."""
    pass

class SessionError(QwenAPIError):
    """Ошибка, связанная с управлением сессией (например, cookies)."""
    pass

class APIRequestError(QwenAPIError):
    """Ошибка при выполнении запроса к API."""
    pass

class AccountManager:
    """
    Управляет пулом учетных записей Qwen.

    Загружает учетные данные из файла и предоставляет их для работы
    в потокобезопасной очереди.
    """
    def __init__(self, accounts_file_path: str):
        if not os.path.exists(accounts_file_path):
            raise FileNotFoundError(f"Файл с аккаунтами не найден: {accounts_file_path}")
        self.accounts_queue = self._load_accounts(accounts_file_path)

    @staticmethod
    def _load_accounts(file_path: str) -> Queue:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                accounts_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            raise ValueError(f"Не удалось прочитать или декодировать файл с аккаунтами: {e}")

        if not accounts_data or not isinstance(accounts_data, list):
            raise ValueError("Файл с аккаунтами пуст или имеет неверный формат.")

        random.shuffle(accounts_data)
        queue = Queue()
        for acc in accounts_data:
            if 'email' not in acc or 'password' not in acc:
                print(f"Предупреждение: пропущен аккаунт с неполными данными: {acc}")
                continue
            acc['auth_token'] = None
            acc['session_valid'] = False
            queue.put(acc)
        
        if queue.empty():
            raise ValueError("В файле не найдено ни одного валидного аккаунта.")
        print(f"Загружено {queue.qsize()} аккаунтов.")
        return queue

    def get_account(self) -> Dict[str, Any]:
        return self.accounts_queue.get()

    def return_account(self, account: Dict[str, Any]):
        self.accounts_queue.put(account)


class CookieManager:
    """
    Управляет общими cookies для всех сессий.
    """
    def __init__(self, cookie_file_path: str, refresh_interval_sec: int = 12 * 60 * 60):
        self.cookie_file_path = cookie_file_path
        self.refresh_interval = refresh_interval_sec
        self.cookie_info = {'ssxmod_itna': None, 'ssxmod_itna2': None, 'last_updated': 0}
        self.lock = threading.Lock()
        self._load_cookies()

    def _load_cookies(self):
        with self.lock:
            if os.path.exists(self.cookie_file_path):
                try:
                    with open(self.cookie_file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.cookie_info.update(data)
                    print("Общие cookies успешно загружены.")
                except (json.JSONDecodeError, IOError):
                    print(f"Файл общих cookie поврежден или нечитаем. Будут созданы новые.")

    def _save_cookies(self):
        with self.lock:
            try:
                with open(self.cookie_file_path, 'w', encoding='utf-8') as f:
                    json.dump(self.cookie_info, f, indent=4)
            except IOError as e:
                print(f"Ошибка при сохранении файла cookies: {e}")

    def are_cookies_valid(self) -> bool:
        with self.lock:
            is_old = (time.time() - self.cookie_info.get('last_updated', 0)) > self.refresh_interval
            is_missing = not self.cookie_info.get('ssxmod_itna') or not self.cookie_info.get('ssxmod_itna2')
            return not is_old and not is_missing

    def get_cookies(self) -> Dict[str, str]:
        with self.lock:
            return {
                'ssxmod_itna': self.cookie_info['ssxmod_itna'],
                'ssxmod_itna2': self.cookie_info['ssxmod_itna2']
            }

    def refresh_cookies(self, account: Dict[str, Any]) -> bool:
        print("Запуск процедуры обновления cookies через Playwright...")
        with sync_playwright() as p:
            browser = None
            try:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context()
                page = context.new_page()
                page.goto("https://chat.qwen.ai/", timeout=60000)
                page.wait_for_function("() => document.cookie.includes('ssxmod_itna2')", timeout=30000)
                
                cookies = context.cookies()
                ssxmod_itna = next((c['value'] for c in cookies if c['name'] == 'ssxmod_itna'), None)
                ssxmod_itna2 = next((c['value'] for c in cookies if c['name'] == 'ssxmod_itna2'), None)

                if not ssxmod_itna or not ssxmod_itna2:
                    raise SessionError("Не удалось получить необходимые cookie (ssxmod_itna/ssxmod_itna2).")

                with self.lock:
                    self.cookie_info = {
                        'ssxmod_itna': ssxmod_itna,
                        'ssxmod_itna2': ssxmod_itna2,
                        'last_updated': time.time()
                    }
                self._save_cookies()
                print("Общие cookies успешно обновлены и сохранены.")
                return True
            except Exception as e:
                print(f"Критическая ошибка при работе Playwright: {e}")
                return False
            finally:
                if browser and browser.is_connected():
                    browser.close()

class QwenAPIClient:
    """
    Клиент для взаимодействия с API Qwen. Содержит только методы для
    работы с API, без логики обработки ответов.
    """
    BASE_URL = "https://chat.qwen.ai"
    DEFAULT_MODEL = "qwen3-max-preview"

    def __init__(self, account_manager: AccountManager, cookie_manager: CookieManager):
        self.account_manager = account_manager
        self.cookie_manager = cookie_manager

    def _get_auth_token(self, account: Dict[str, Any]) -> str:
        if account.get('auth_token'):
            return account['auth_token']
        print(f"Получение токена для аккаунта {account['email']}...")
        headers = {'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'}
        payload = {'email': account['email'], 'password': account['password']}
        try:
            response = requests.post(f'{self.BASE_URL}/api/v1/auths/signin', headers=headers, json=payload, timeout=20)
            response.raise_for_status()
            token = response.json().get('token')
            if not token:
                raise AuthenticationError("Ответ API не содержит токен.")
            account['auth_token'] = token
            print(f"Токен для {account['email']} успешно получен.")
            return token
        except requests.RequestException as e:
            raise AuthenticationError(f"Ошибка сети при получении токена для {account['email']}: {e}")
        except (KeyError, json.JSONDecodeError):
            raise AuthenticationError(f"Не удалось извлечь токен из ответа API для {account['email']}.")

    def _ensure_session_is_valid(self, account: Dict[str, Any]):
        if account.get('session_valid'):
            return
        if not self.cookie_manager.are_cookies_valid():
            print("Общие cookies устарели или отсутствуют. Запуск обновления...")
            if not self.cookie_manager.refresh_cookies(account):
                raise SessionError("Не удалось обновить общие cookies.")
        self._get_auth_token(account)
        account['session_valid'] = True
        print(f"Сессия для аккаунта {account['email']} валидна.")

    def _get_request_headers(self, auth_token: str) -> Dict[str, str]:
        return {
            'authorization': f'Bearer {auth_token}',
            'content-type': 'application/json; charset=UTF-8',
            'accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        }

    def _get_request_cookies(self, auth_token: str) -> Dict[str, str]:
        cookies = self.cookie_manager.get_cookies()
        cookies['token'] = auth_token
        return cookies

    def _get_sts_token(self, account: Dict[str, Any], filename: str, filesize: int, filetype: str = 'file') -> Optional[Dict[str, Any]]:
        """
        Получает токен STS (Security Token Service) для загрузки файлов.
        
        Args:
            account (Dict[str, Any]): Объект аккаунта с аутентификацией.
            filename (str): Имя файла.
            filesize (int): Размер файла в байтах.
            filetype (str): Тип файла ('file' или 'image').
            
        Returns:
            Optional[Dict[str, Any]]: Словарь с данными токена STS или None в случае ошибки.
        """
        payload = {'filename': os.path.basename(filename), 'filesize': filesize, 'filetype': filetype}
        try:
            response = requests.post(
                f'{self.BASE_URL}/api/v2/files/getstsToken',
                cookies=self._get_request_cookies(account['auth_token']),
                headers=self._get_request_headers(account['auth_token']),
                json=payload,
                timeout=15
            )
            response.raise_for_status()
            result = response.json()
            if result.get('success') and 'data' in result:
                return result['data']
            else:
                print(f"Не удалось получить STS токен: {result.get('message', 'Неизвестная ошибка')}")
                return None
        except requests.RequestException as e:
            print(f"Ошибка при запросе STS токена: {e}")
            return None

    def _upload_file_to_oss(self, account: Dict[str, Any], file_content: bytes, file_name: str) -> Optional[Dict[str, Any]]:
        """
        Загружает файл на сервер OSS, используя полученный STS токен.
        
        Args:
            account (Dict[str, Any]): Объект аккаунта с аутентификацией.
            file_content (bytes): Содержимое файла в байтах.
            file_name (str): Имя файла.
            
        Returns:
            Optional[Dict[str, Any]]: Словарь с информацией о загруженном файле или None.
        """
        filesize = len(file_content)
        file_ext = os.path.splitext(file_name)[1].lower()
        file_type = 'image' if file_ext in ('.png', '.jpg', '.jpeg') else 'file'
        content_type = f'image/{file_ext[1:]}' if file_type == 'image' else 'application/octet-stream'

        sts_data = self._get_sts_token(account, file_name, filesize, file_type)
        if not sts_data:
            return None
        
        try:
            auth = oss2.StsAuth(sts_data['access_key_id'], sts_data['access_key_secret'], sts_data['security_token'])
            bucket = oss2.Bucket(auth, f"https://{sts_data['endpoint']}", sts_data['bucketname'])
            result = bucket.put_object(sts_data['file_path'], file_content, headers={'Content-Type': content_type})
            
            if result.status == 200:
                print(f"Файл '{file_name}' успешно загружен на OSS.")
                return {
                    'id': sts_data['file_id'],
                    'url': sts_data['file_url'],
                    'name': os.path.basename(file_name),
                    'size': filesize,
                    'status': 'uploaded',
                    'file_type': content_type,
                    'showType': file_type,
                    'file_class': 'vision' if file_type == 'image' else 'code_interpreter',
                    'type': file_type
                }
            else:
                print(f"Ошибка загрузки файла на OSS. Статус: {result.status}")
                return None
        except Exception as e:
            print(f"Критическая ошибка при загрузке файла на OSS: {e}")
            return None


    def create_chat(self, title: str, chat_type: str = 'search') -> Dict[str, Any]:
        account = self.account_manager.get_account()
        try:
            self._ensure_session_is_valid(account)
            print(f"Создание новой сессии чата (тип: {chat_type}) от имени {account['email']}...")
            payload = {'title': title, 'models': [self.DEFAULT_MODEL], 'chat_mode': 'normal', 'chat_type': chat_type}
            response = requests.post(
                f'{self.BASE_URL}/api/v2/chats/new',
                cookies=self._get_request_cookies(account['auth_token']),
                headers=self._get_request_headers(account['auth_token']),
                json=payload
            )
            response.raise_for_status()
            result = response.json()
            if not result.get('success') or 'data' not in result or 'id' not in result['data']:
                raise APIRequestError(f"Не удалось создать чат: {result}")
            chat_id = result['data']['id']
            print(f"Чат '{title}' успешно создан с ID: {chat_id}")
            
            # Возвращаем состояние сессии вместе с аккаунтом
            return {'chat_id': chat_id, 'messages': [], 'account': account}

        except Exception as e:
            # Если создание чата не удалось, возвращаем аккаунт в очередь
            self.account_manager.return_account(account)
            account['session_valid'] = False
            if isinstance(e, requests.HTTPError) and e.response.status_code in [401, 403]:
                 raise AuthenticationError(f"Ошибка авторизации при создании чата: {e.response.text}")
            raise APIRequestError(f"Ошибка при создании чата: {e}")

    def send_message(self, chat_state: Dict[str, Any], prompt: str, file_paths: Optional[List[str]] = None,
                     chat_type: str = 'search', sub_chat_type: str = 'search') -> Generator[Dict[str, Any], None, None]:
        account = chat_state.get('account')
        if not account:
            raise ValueError("Объект сессии (chat_state) должен содержать 'account'.")
            
        try:
            self._ensure_session_is_valid(account)
            chat_id = chat_state['chat_id']
            parent_id = next((msg['id'] for msg in reversed(chat_state.get('messages', [])) if msg.get('role') == 'assistant'), None)
            
            headers = self._get_request_headers(account['auth_token'])
            headers['Accept'] = 'text/event-stream'
            headers['Referer'] = f"{self.BASE_URL}/c/{chat_id}"

            files_payload = []
            if file_paths:
                print("Обнаружены файлы для загрузки. Инициализация...")
                for file_path in file_paths:
                    if os.path.exists(file_path):
                        try:
                            with open(file_path, 'rb') as f:
                                file_content = f.read()
                            uploaded_file = self._upload_file_to_oss(account, file_content, os.path.basename(file_path))
                            if uploaded_file:
                                files_payload.append(uploaded_file)
                        except Exception as e:
                            print(f"Ошибка при обработке файла '{file_path}': {e}")
                    else:
                        print(f"Файл не найден по указанному пути: '{file_path}'")
            
            payload = {
                'stream': True, 'incremental_output': True, 'chat_id': chat_id, 'chat_mode': 'normal',
                'model': self.DEFAULT_MODEL, 'parent_id': parent_id,
                'messages': [{
                    'fid': str(uuid.uuid4()), 'parentId': parent_id, 'role': 'user', 'content': prompt, 'user_action': 'chat',
                    'files': files_payload, 'timestamp': int(time.time()), 'models': [self.DEFAULT_MODEL],
                    'chat_type': chat_type,
                    'feature_config': {'thinking_enabled': True, 'output_schema': 'phase', 'search_version': 'v2', 'thinking_budget': 81920},
                    'extra': {'meta': {'subChatType': sub_chat_type}}, 'sub_chat_type': sub_chat_type,
                }],
                'timestamp': int(time.time() * 1000), 'size': '1:1',
            }

            response = requests.post(
                f'{self.BASE_URL}/api/v2/chat/completions',
                params={'chat_id': chat_id},
                cookies=self._get_request_cookies(account['auth_token']),
                headers=headers, json=payload, stream=True, timeout=300
            )
            response.raise_for_status()

            buffer = ""
            for chunk in response.iter_content(chunk_size=None):
                buffer += chunk.decode('utf-8', errors='ignore')
                while 'data:' in buffer:
                    start_index = buffer.find('data:')
                    end_index = buffer.find('\n\n', start_index)
                    if end_index == -1: break
                    line = buffer[start_index + 5:end_index].strip()
                    buffer = buffer[end_index + 2:]
                    if not line: continue
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue
        except requests.HTTPError as e:
            account['session_valid'] = False
            if e.response.status_code in [401, 403]:
                raise AuthenticationError(f"Ошибка авторизации при отправке сообщения: {e.response.text}")
            raise APIRequestError(f"HTTP ошибка при отправке сообщения: {e}")
        except Exception as e:
            account['session_valid'] = False
            raise APIRequestError(f"Непредвиденная ошибка при отправке сообщения: {e}")


    def delete_chat(self, chat_state: Dict[str, Any]) -> bool:
        account = chat_state.get('account')
        chat_id = chat_state.get('chat_id')
        if not account or not chat_id:
            print("Предупреждение: не удалось удалить чат, неверное состояние сессии.")
            return False
            
        try:
            self._ensure_session_is_valid(account)
            print(f"Удаление чата с ID: {chat_id} от имени {account['email']}...")
            
            headers = self._get_request_headers(account['auth_token'])
            headers['Referer'] = f"{self.BASE_URL}/c/{chat_id}"

            response = requests.delete(
                f'{self.BASE_URL}/api/v2/chats/{chat_id}',
                cookies=self._get_request_cookies(account['auth_token']),
                headers=headers
            )
            response.raise_for_status()
            result = response.json()
            if result.get('success'):
                print(f"Чат {chat_id} успешно удален на сервере.")
                return True
            else:
                print(f"Не удалось удалить чат {chat_id}: {result.get('message', 'Нет сообщения об ошибке')}")
                return False
        except requests.HTTPError as e:
            account['session_valid'] = False
            print(f"Ошибка при удалении чата: {e.response.text}")
            return False
        finally:
            # Возвращаем аккаунт в очередь в любом случае, так как сессия завершена.
            self.account_manager.return_account(account)


if __name__ == '__main__':
    ACCOUNTS_FILE = "accounts.json"
    COOKIES_FILE = "shared_cookies.json"

    try:
        account_manager = AccountManager(accounts_file_path=ACCOUNTS_FILE)
        cookie_manager = CookieManager(cookie_file_path=COOKIES_FILE)
        api_client = QwenAPIClient(account_manager, cookie_manager)
    except (FileNotFoundError, ValueError) as e:
        print(f"Ошибка инициализации: {e}")
        exit(1)

    chat_session = None
    try:
        chat_session = api_client.create_chat(title="Тестовый чат с файлом")
        user_prompt = "Как мне лучше написать кроссплатформенное приложение на C#? .NET MAUI мне не подходит."
        
        print(f"\n> Пользователь: {user_prompt}")
        
        print("\n< Ответ AI:")
        full_response = ""
        stream = api_client.send_message(chat_session, user_prompt)
        for event in stream:
            if 'choices' in event and event['choices']:
                delta = event['choices'][0].get('delta', {})
                content = delta.get('content', '')
                if content:
                    full_response += content
                    print(content, end='', flush=True)
        print("\n\n--- Поток завершен ---")

    except QwenAPIError as e:
        print(f"\n\nПроизошла ошибка API: {e}")
    except Exception as e:
        print(f"\n\nПроизошла непредвиденная ошибка: {e}")
    finally:
        if chat_session:
            # Передаем весь объект сессии для корректного удаления и возврата аккаунта
            api_client.delete_chat(chat_session)
        if os.path.exists("test_file.txt"):
            os.remove("test_file.txt")
            print("Тестовый файл удален.")
