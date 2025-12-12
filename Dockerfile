# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (handling both package.json and package-lock.json if it exists)
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci || npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
# Copy backend server file
COPY --from=builder /app/server.js ./server.js

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080
ENV PORT=8080

# Start the server
CMD ["node", "server.js"]
