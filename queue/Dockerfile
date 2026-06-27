# Use specific Node.js version
FROM node:24-bookworm-slim

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker's cache
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
RUN npm install

# Copy the application source code
COPY . .

# Create shared data directory with open permissions for cross-container access
RUN mkdir -p /usr/src/app/data && chmod 1777 /usr/src/app/data

# Expose port 3002 for local testing
EXPOSE 3002

USER node

CMD ["node", "server.js"]