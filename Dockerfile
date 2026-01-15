# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy backend package files
COPY package*.json ./
COPY prisma ./prisma/

# Install backend dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy backend source files
COPY . .

# Build TypeScript backend
RUN npm run build

# Build mini-app
WORKDIR /app/mini-app
COPY mini-app/package*.json ./
RUN npm ci
COPY mini-app/ ./
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install production runtime dependencies
RUN apk add --no-cache openssl ca-certificates

# Copy backend package files and dependencies
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules

# Copy built backend files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built mini-app static files
COPY --from=builder /app/mini-app/dist ./miniapp-dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment
ENV NODE_ENV=production

EXPOSE 3001

# Run migrations and start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
