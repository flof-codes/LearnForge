FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm install

COPY . .
RUN npx tsc

RUN mkdir -p /data/images

EXPOSE 3000
CMD ["node", "dist/index.js"]
