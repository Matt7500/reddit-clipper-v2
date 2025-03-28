# Use an official Node.js runtime as a parent image (Choose version matching your project)
FROM node:18-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# --- Install Root Dependencies ---
# Copy root package files
COPY package.json package-lock.json* ./
# Install root dependencies
RUN npm ci

# --- Install Backend Dependencies ---
# Copy backend package files
COPY backend/package.json backend/package-lock.json* ./backend/
# Install backend dependencies
RUN cd backend && npm ci

# --- Copy Application Code ---
# Copy the rest of the application code
# Note: This includes the node_modules installed above
COPY . .

# --- Build Frontend ---
# Run the Vite build command defined in the root package.json
RUN npm run build

# --- Runtime ---
# Expose the port the backend server listens on (Railway injects PORT env var)
# EXPOSE 3004 # This is informational, Railway handles port mapping

# Define the command to run the application
# Uses the "start" script from the root package.json: "cd backend && node server.js"
CMD ["npm", "run", "start"] 