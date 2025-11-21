FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure entrypoint.sh remains executable - using multiple approaches to ensure it works
RUN chmod +x entrypoint.sh
RUN ["chmod", "+x", "entrypoint.sh"]

EXPOSE 80

CMD ["sh", "-c", "./entrypoint.sh"]