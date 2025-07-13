# Use specific Node.js version
FROM node:14.21.3

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker's cache
COPY package*.json ./

# Install a version of sharp compatible with Node 14
RUN npm install sharp@0.32.2

# Install ALL dependencies (including devDependencies)
RUN npm install

# Copy the application source code
COPY . .

# Expose port 3002 for local testing
EXPOSE 3002

USER node

CMD ["node", "server.js"]