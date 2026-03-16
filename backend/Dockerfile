FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN mkdir -p /app/generated

EXPOSE 8217

CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js && node src/server.js"]
