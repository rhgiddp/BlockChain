FROM node:18-alpine

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 복사
COPY . .

EXPOSE 3004

CMD ["node", "src/index.js"]
