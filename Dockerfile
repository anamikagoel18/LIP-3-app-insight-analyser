# --- Multi-Runtime Dockerfile (Python + Node.js) ---
# Base Image: Python 3.10-slim
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Step 1: Install System Dependencies & Node.js
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Step 2: Install Python Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Step 3: Install Node.js Dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Step 4: Copy Application Code
COPY . .

# Step 5: Environment Variables (Standard Defaults)
ENV PORT=8000
ENV PYTHONPATH=/app
ENV DATA_DIR=/app/data
ENV REPORTS_DIR=/app/reports

# Ensure directories exist for persistent volumes
RUN mkdir -p /app/data /app/reports

# Step 6: Entry Point (Gunicorn for Production)
# We use 'sh -c' to ensure the $PORT environment variable is correctly expanded by the shell
CMD sh -c "gunicorn -w 4 -k uvicorn.workers.UvicornWorker phase4_api.main:app --bind 0.0.0.0:$PORT"

