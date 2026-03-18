# ---- build stage ----
# Node 20 slim + Python/make/g++ to compile better-sqlite3's native addon.
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ---- runtime stage ----
FROM node:20-slim

WORKDIR /app

# Copy compiled node_modules and source
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Persistent data directory (mount a volume here in production)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/datumprikker.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/app.js"]
