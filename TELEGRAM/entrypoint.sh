#!/bin/sh

set -e

echo "Starting Telegram bot setup..."

echo "Waiting for backend service..."
while ! nc -z backend 8000; do
  sleep 1
done

echo "Backend service is ready. Starting Telegram bot..."

exec python bot.py