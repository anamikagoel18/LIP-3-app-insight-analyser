# --- Multi-Runtime Dockerfile (Python + Node.js) ---
# Base Image: Python 3.11-slim (Resolves Google API deprecation warnings)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Step 1: Install System Dependencies & Node.js
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
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
ENV PYTHONPATH=/app
ENV DATA_DIR=/app/data
ENV REPORTS_DIR=/app/reports
ENV PYTHONIOENCODING=utf-8
ENV LANG=C.UTF-8
ENV PYTHONWARNINGS="ignore::FutureWarning"


# Ensure directories exist for persistent volumes
RUN mkdir -p /app/data /app/reports && chmod -R 777 /app/data /app/reports
# Step 6: Entry Point (Direct Uvicorn for Stability)
CMD ["sh", "-c", "python -m uvicorn phase4_api.main:app --host 0.0.0.0 --port $PORT --workers 1"]





