FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json eslint.config.js ./
COPY src ./src
RUN npm run build
EXPOSE 3001
CMD ["sh", "-c", "npm run prisma:deploy && npm start"]
