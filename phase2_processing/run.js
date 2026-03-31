const processor = require('./processor');
const fs = require('fs');
const path = require('path');
const logger = require('../phase6_utils/logger');

function run() {
  const inputPath = path.join(__dirname, '../data/raw_reviews.json');
  const outputPath = path.join(__dirname, '../data/processed_reviews.json');

  if (!fs.existsSync(inputPath)) {
    logger.error(`Phase 2: Input file not found at ${inputPath}. Run Phase 1 first.`);
    process.exit(1);
  }

  try {
    const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const processedData = processor.process(rawData);

    fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
    logger.info(`Phase 2 complete. Saved ${processedData.length} processed reviews to ${outputPath}`);
  } catch (error) {
    logger.error(`Phase 2 Run Failed: ${error.message}`);
    process.exit(1);
  }
}

run();
