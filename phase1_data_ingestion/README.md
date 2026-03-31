# Phase 1: Data Ingestion

## What it does
Fetches recent reviews for the INDmoney app (`in.indwealth`) from the Google Play Store using `google-play-scraper`.

## Input File
- **Direct API Call**: Fetches directly from Google Play Store.

## Output File
- `data/raw_reviews.json`: The raw JSON dump of fetched reviews.

## How to run
```bash
node phase1_data_ingestion/run.js
```
