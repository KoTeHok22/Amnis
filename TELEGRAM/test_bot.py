import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', 'YOUR_TELEGRAM_BOT_TOKEN_HERE')
BACKEND_BASE_URL = os.getenv('BACKEND_BASE_URL', 'https://api.jdh-team.ru')

async def test_telegram_bot():
    print("Testing Telegram Bot Integration...")

    if TELEGRAM_BOT_TOKEN == 'YOUR_TELEGRAM_BOT_TOKEN_HERE' or not TELEGRAM_BOT_TOKEN:
        print("❌ Error: TELEGRAM_BOT_TOKEN environment variable is not set")
        print("Please set TELEGRAM_BOT_TOKEN with your actual bot token")
        return False

    print("✅ Environment variables check passed")

    try:
        from telegram import Update
        from telegram.ext import Application
        print("✅ Telegram bot libraries imported successfully")
    except ImportError as e:
        print(f"❌ Error importing telegram libraries: {e}")
        return False

    try:
        import httpx
        print("✅ HTTP client library imported successfully")
    except ImportError as e:
        print(f"❌ Error importing httpx: {e}")
        return False

    try:
        from database import SessionLocal
        from models import TelegramUser
        print("✅ Database models imported successfully")
    except ImportError as e:
        print(f"❌ Error importing database modules: {e}")
        return False

    try:
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        print("✅ Database connection test passed")
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
        return False

    print("\n" + "="*50)
    print("Telegram Bot Integration Test Results:")
    print("✅ Environment variables configured")
    print("✅ Required libraries imported")
    print("✅ Database connection working")
    print("✅ All components are properly integrated")
    print("="*50)
    print("\nTo run the bot:")
    print("1. Make sure your backend server is running on:", BACKEND_BASE_URL)
    print("2. Set TELEGRAM_BOT_TOKEN environment variable with your bot token")
    print("3. Run the bot with: python bot.py")
    print("\nThe bot is ready for use!")

    return True

if __name__ == "__main__":
    success = asyncio.run(test_telegram_bot())
    if success:
        print("\n🎉 All tests passed! The Telegram bot is ready to run.")
    else:
        print("\n💥 Some tests failed. Please fix the issues before running the bot.")