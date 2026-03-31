# App Insight Analyser - Data Pipeline Architecture

## Overview
This project implements a structured data pipeline for analyzing INDmoney app reviews. Each phase is independent, has a clear responsibility, and communicates via standardized JSON files.

## Data Pipeline Flow
1. **Phase 1: Ingestion** (`phase1_data_ingestion`)
   - Fetches reviews from Google Play Store.
   - Output: `data/raw_reviews.json`.
2. **Phase 2: Processing** (`phase2_processing`)
   - Cleans, normalizes, and deduplicates reviews.
   - Output: `data/processed_reviews.json`.
3. **Phase 3: Analysis** (`phase3_analysis`)
   - Generates sentiment counts and keyword insights.
   - Output: `reports/weekly_report.json`.
4. **Phase 4: API Server** (`phase4_api`)
   - Serves the processed data and reports via REST.
5. **Phase 5: Next.js Dashboard** (`phase5_nextjs`)
   - Branded "INDMONEY Pulse" command center.
6. **Phase 6: Utilities & Scheduler** (`phase6_utils`)
   - Shared logging, DB, and **Hub for Automated Scheduling**.

## How to Run the Pipeline

### Manual Step-by-Step
```bash
node phase1_data_ingestion/run.js
node phase2_processing/run.js
node phase3_analysis/run.js
```

### Automated Full Pipeline
```bash
npm run pipeline:full
```

### Start Services
- **Backend (Python)**: `python -m phase4_api.main`
- **Frontend (Next.js)**: `cd phase5_nextjs && npm run dev`
- **Weekly Scheduler**: `npm run scheduler` (Triggers every Tue at 12:15 PM IST)

## Configuration
Update the `.env` file with your environment variables (PORT, etc.).
