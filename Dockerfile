# Use specific Node.js version
FROM node:14.21.3-slim

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker's cache
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
RUN npm ci

# Copy the rest of your application's source code
COPY . .

# Expose the port your Node.js application listens on
EXPOSE 3001

# Start the app
CMD ["npm", "start"]