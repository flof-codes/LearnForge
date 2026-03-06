FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npx tsc

RUN mkdir -p /data/images

EXPOSE 3001
CMD ["node", "dist/index.js"]
