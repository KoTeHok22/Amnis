from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status
from pydantic import BaseModel
SECRET_KEY = "your-secret-key-change-this-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b", bcrypt__rounds=12)
class Token(BaseModel):
    """Модель токена для аутентификации"""
    access_token: str
    token_type: str
class TokenData(BaseModel):
    """Данные, содержащиеся в токене"""
    phone_number: Optional[str] = None
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяет, соответствует ли введенный пароль хэшированному.
    Args:
        plain_password: Не зашифрованный пароль
        hashed_password: Зашифрованный пароль для сравнения
    Returns:
        bool: True, если пароли совпадают, иначе False
    """
    return pwd_context.verify(plain_password, hashed_password)
def get_password_hash(password: str) -> str:
    """Возвращает хэш для указанного пароля.
    Args:
        password: Пароль для хэширования
    Returns:
        str: Хэшированный пароль
    """
    if password is None:
        raise ValueError("Password cannot be None")

    # bcrypt has a limitation of 72 bytes for passwords
    if len(password.encode('utf-8')) > 72:
        password = password.encode('utf-8')[:72].decode('utf-8', errors='ignore')

    return pwd_context.hash(password)
def authenticate_user(stored_hash: str, password: str) -> bool:
    """Аутентифицирует пользователя по хэшу пароля.
    Args:
        stored_hash: Сохраненный хэш пароля
        password: Введенный пользователем пароль
    Returns:
        bool: True, если аутентификация успешна, иначе False
    """
    if not stored_hash or not password:
        return False
    try:
        return verify_password(password, stored_hash)
    except Exception:
        # Log the exception to help with debugging
        print(f"Authentication error - stored_hash: {'***' if stored_hash else 'None'}, password: {'***' if password else 'None'}")
        return False
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Создает JWT токен с указанными данными.
    Args:
        data: Данные для включения в токен
        expires_delta: Время жизни токена (по умолчанию 15 минут)
    Returns:
        str: Закодированный JWT токен
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
def verify_token(token: str) -> Optional[TokenData]:
    """Проверяет валидность JWT токена и возвращает данные из него.
    Args:
        token: JWT токен для проверки
    Returns:
        Optional[TokenData]: Данные токена или None, если токен недействителен
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        phone_number: str = payload.get("sub")
        if phone_number is None:
            return None
        token_data = TokenData(phone_number=phone_number)
        return token_data
    except JWTError:
        return None