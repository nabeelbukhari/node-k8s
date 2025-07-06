# Use official Node.js LTS image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set the web UI port to 3000 for Docker
ENV WEB_UI_PORT=3000

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on (adjust if needed)
EXPOSE 3000 9229

# Start the application (adjust if needed)
CMD ["node", "--inspect=0.0.0.0:9229", "src/web-server.js"]
