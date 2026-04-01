# INDmoney Pulse - Intelligence Dashboard (Cloud Optimized)

## Overview
This project provides a professional, AI-driven command center for analyzing INDmoney app reviews. It performs automated sentiment analysis, theme extraction, and strategic reporting using a unified data pipeline and a premium Streamlit dashboard.

## Services & Access
The project is optimized for both local execution and **Streamlit Cloud Deployment**.

- **📊 Unified Dashboard**: [http://localhost:8501](http://localhost:8501) (Streamlit Standalone)
- **🧠 Intelligence API**: (Optional) `phase4_api/main.py` is still available for external API access.

## How to Run Locally

### 1. Setup Environment
Ensure your `.env` file contains your `GROQ_API_KEY` and `GEMINI_API_KEY`.

### 2. Start Dashboard
```bash
# Install dependencies
pip install -r requirements.txt
npm install

# Run the standalone dashboard
streamlit run streamlit_app.py
```

## ☁️ Deployment to Streamlit Cloud

This project is "Deploy Ready" for Streamlit Cloud.

### 1. Connect Repository
- Push this code to GitHub.
- Connect your repository in the [Streamlit Cloud Dashboard](https://share.streamlit.io/).
- Set the main file path to `streamlit_app.py`.

### 2. Configure Secrets
In the Streamlit Cloud settings for your app, add the following to **Secrets**:
```toml
GROQ_API_KEY = "your_key_here"
GEMINI_API_KEY = "your_key_here"
SMTP_USER = "your_email@gmail.com"
SMTP_PASS = "your_app_password"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
```

### 3. Automatic Environment Setup
The app will automatically:
- Detect the cloud environment.
- Install Node.js via `packages.txt`.
- Run `npm install` on first startup to initialize the review-fetching pipeline.
