FROM node:20-bookworm-slim

# Install base dependencies for native extensions
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package descriptors
COPY package*.json ./

# Install dependencies (ensure native builds run successfully)
RUN npm install

# Copy application source
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
