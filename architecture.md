# App Insight Analyser Architecture

## System Overview
The App Insight Analyser is a tool designed to monitor and summarize user sentiment for the `indmoney` app. It automates the process of fetching Play Store reviews, analyzing them for recurring themes, and generating actionable insights for product and leadership teams.

```mermaid
graph TD
    subgraph Frontend [Web UI]
        G[Dashboard] -->|Trigger Fetch| H[API: /fetch]
        G -->|Trigger Report| I[API: /report]
        G -->|Trigger Email| J[API: /email]
        K[Report Viewer] <--> G
    end

    subgraph Backend [Node.js Express / Python FastAPI]
        H --> L(Review Fetcher)
        I --> M(Groq Analysis Service)
        J --> N(SMTP Email Service)
        
        L -->|Adaptive Target| O(Data Processor)
        O -->|PII Scrub| P[(Storage: SQLite)]
        P --> M
        
        M -->|Single-Pass / Batch| Q(Aggregation Layer)
        Q -->|Cached Results| R(Cache: File/Memory)
        R --> K
    end

    subgraph Automation [Phase 6: Cloud Automation]
        S[GitHub Actions Cron] -->|45 6 * * 2 (UTC)| L
        S -->|Workflow Dispatch| N
        T[Local Node-Cron] -->|Fallback| L
    end

    A[Play Store] -->|External| L
    N -->|Weekly Pulse| Z[Stakeholder Email]
```

## Component Breakdown

### 1. Review Fetcher (Data Acquisition)
- **Technology**: `google-play-scraper` (Node.js library).
- **Responsibility**: Retrieves up to **400 recent reviews** for the `in.indwealth` app (INDmoney) directly from the Google Play Store.
- **Constraints**: 
    - Limit ingestion to 400 reviews per cycle to maintain performance and LLM context window fit.
    - 3x retry on fetch failures with exponential backoff.

### 2. Data Processor & Storage Layer
- **Preprocessing Rules**: 
    - **Remove Titles**: Review titles are completely stripped; only review text is processed.
    - **Length Filtering**: Discard reviews with < 5 words.
    - **Critical Exception**: Reviews with < 5 words are *kept* if they contain: `crash`, `failed`, `error`, `stuck`, `bug`.
    - **Language Filtering**: Explicitly filter for **English-only** reviews.
    - **PII Redaction**: Regex scrubbing of emails, phone numbers, and potential names.
- **Storage Strategy**: Cleaned and filtered reviews are stored in the persistent layer (SQLite/JSON) **BEFORE** any LLM processing. This stored data is reused for report generation and future comparisons.
- **Schema**:
    - `text` (string)
    - `rating` (int)
    - `date` (ISO string)
    - `helpfulCount` (int)
- **Pre-defined Taxonomy**: 
    - `Onboarding/KYC`
    - `Payments/Withdrawals`
    - `Trading/Investments`
    - `App Performance (Crash/Bug)`
    - `Customer Support`
    - `UI/UX/General`

### 3. Groq Analysis Service (Map-Reduce)
- **Map Phase**: Process chunks of 40–50 reviews. Each chunk is categorized by LLM using the Taxonomy.
- **Reduce Phase**: Summarize chunk outputs into a final "Weekly Pulse".
- **Caching**: LLM outputs are cached per chunk hash to prevent redundant API calls.

### 4. Aggregation Layer (Non-LLM)
- **Logic**: Counts and ranks themes from the Map phase using standard JS logic (not LLM) to ensure statistical accuracy in frequency reporting.
- **Trend Comparison**: Compares current theme counts against previous week's stored data.

### 5. Web UI & Logging
- **Logging**: Phase-aware logging using Winston, tracked in `logs/combined.log`.
- **Dashboard**: Next.js 16 (Phase 5) command center for real-time monitoring and manual triggers.

### 6. Phase 6: Cloud Automation & GitHub Actions
- **Technology**: GitHub Actions (Runner: `ubuntu-latest`).
- **Orchestration**: `phase6_utils/cloud_run.js`.
- **Workflow**:
    - **Trigger (12:15 PM IST / 06:45 AM UTC)**: GitHub Runner installs Node.js, triggers `cloud_run.js`.
    - **Intelligence Synthesis**: Same high-fidelity 75-review analysis as the local pipeline.
    - **Cloud Sending**: Runner uses GitHub Repository Secrets to authenticate with SMTP and Groq.
- **Local Fallback**: The project retains the `node-cron` scheduler (`scheduler.js`) for local debugging and on-premise execution.

## Data Flow
1. **Trigger**: Manual CLI command or scheduled cron job.
2. **Ingestion**: Fetch reviews from the last ~90 days.
3. **Cleaning**: Remove PII and format metadata.
4. **Processing**: Batch-send review text to Groq API with structured prompts.
5. **Synthesis**: Aggregate Groq responses into a cohesive report.
6. **Delivery**: Save report locally and prepare/send an email draft.

## Security & Privacy
- **No PII Stored**: Reviews are scrubbed *before* being processed by the LLM.
- **API Security**: Groq API keys are managed through environment variables (`.env`).
