FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

ENV DB_PATH=/data/arachne.db
EXPOSE 3000

CMD ["node", "dist/index.js"]
