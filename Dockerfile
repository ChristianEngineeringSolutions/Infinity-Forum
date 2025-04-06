FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json package-lock.json ./

RUN npm ci --only=production

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 8080

CMD ["npm", "start"]