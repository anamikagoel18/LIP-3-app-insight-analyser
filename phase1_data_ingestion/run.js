const fetcher = require('./fetcher');
const fs = require('fs');
const path = require('path');
const logger = require('../phase6_utils/logger');

async function run() {
  try {
    const reviews = await fetcher.fetchReviews();
    const outputPath = path.join(__dirname, '../data/raw_reviews.json');
    
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(reviews, null, 2));
    logger.info(`Phase 1 complete. Saved ${reviews.length} raw reviews to ${outputPath}`);
  } catch (error) {
    logger.error(`Phase 1 Run Failed: ${error.message}`);
    process.exit(1);
  }
}

run();
