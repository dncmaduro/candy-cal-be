FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn config set registry https://registry.npmjs.org \
 && yarn config set network-timeout 600000 -g \
 && yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Chỉ cần deps runtime (node_modules đã được build stage cài)
COPY --from=builder /app/node_modules ./node_modules

# Dist build ra từ Nest
COPY --from=builder /app/dist ./dist

# (Tùy chọn) copy package.json để debug/versioning, không bắt buộc
COPY --from=builder /app/package.json ./package.json
# COPY .env.production .env

EXPOSE 3333
CMD ["node", "dist/main.js"]
