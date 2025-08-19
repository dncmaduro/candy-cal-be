FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn config set registry https://registry.npmjs.org \
 && yarn config set network-timeout 600000 -g \
 && yarn install --frozen-lockfile   # <— bỏ --network=host ở đây

COPY . .
RUN yarn build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY .env.production .env

ENV NODE_ENV=production
EXPOSE 3333
CMD ["node", "dist/main.js"]
