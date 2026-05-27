FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY OLD/accounts.json ./OLD/accounts.json
COPY server.js ./

ENV HOST=0.0.0.0
ENV PORT=11434

EXPOSE 11434

CMD ["node", "server.js"]
