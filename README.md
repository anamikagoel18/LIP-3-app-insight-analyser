# INDmoney Pulse - Intelligence Dashboard (Pure Python)

## Overview
**INDmoney Pulse** is a high-performance, AI-driven command center designed to monitor user sentiment and extract strategic insights from the INDmoney mobile app's Play Store reviews. Rebuilt from the ground up for **Speed and Streamlit Cloud**, this version offers a pure Python pipeline with zero-latency ingestion.

## ✨ High-Performance Features
- **🚀 Native Ingestion**: Replaced Node.js subprocesses with a high-speed Python scraper.
- **🧠 AI Synthesis**: Powered by Groq (Llama-3) and Gemini 1.5 Flash for rapid trend discovery.
- **📬 Strategic Dispatch**: Integrated one-click email reports for Stakeholders and Product Teams.
- **☁️ Cloud Optimized**: Zero Node.js dependencies—perfect for lightweight Streamlit Cloud deployment.

## How to Run Locally

### 1. Setup Environment
Ensure your `.env` file contains your `GROQ_API_KEY` and `GEMINI_API_KEY`.

### 2. Launch Dashboard
```bash
# Install dependencies
pip install -r requirements.txt

# Start the standalone dashboard
streamlit run streamlit_app.py
```

## ☁️ Deployment to Streamlit Cloud

### 1. Connect Repository
Connect your GitHub repo to [share.streamlit.io](https://share.streamlit.io/) and set the entry point to `streamlit_app.py`.

### 2. Configure Secrets
In the Streamlit Cloud Settings -> Secrets section, add the following to **Secrets (TOML format)**:
```toml
GROQ_API_KEY = "your_key"
GEMINI_API_KEY = "your_key"
SMTP_USER = "your_email@gmail.com"
SMTP_PASS = "your_app_password" # Use App Passwords for Gmail
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
```

## Architecture Summary
This project has been optimized to run as a single-process Python application. The 6-phase Node.js pipeline has been deprecated in favor of this streamlined, high-speed architecture.
