# Use specific Node.js version
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker's cache
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
RUN npm install

# Copy the rest of your application's source code
COPY . .

# Create shared data directory with open permissions for cross-container access
RUN mkdir -p /usr/src/app/data && chmod 1777 /usr/src/app/data

# Expose the port your Node.js application listens on
EXPOSE 3001

# Start the app [Development mode with nodemon]
CMD ["npm", "start-dev"]