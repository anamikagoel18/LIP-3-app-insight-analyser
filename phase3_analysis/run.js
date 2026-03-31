const fs = require('fs');
const path = require('path');
const logger = require('../phase6_utils/logger');
const groqService = require('./services/groqService');
const geminiService = require('./services/geminiService');

async function run() {
  const inputPath = path.join(__dirname, '../data/processed_reviews.json');
  const reportPath = path.join(__dirname, '../reports/weekly_report.json');
  const pulsePath = path.join(__dirname, '../reports/weekly_pulse.json');

  if (!fs.existsSync(inputPath)) {
    logger.error(`Phase 3: Input file not found at ${inputPath}.`);
    process.exit(1);
  }

  try {
    const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // 1. Step 1 (Groq API): Batch extract themes and structured insights
    const groqInsights = await groqService.processAll(rawData, 100);
    if (!groqInsights || groqInsights.length === 0) {
        logger.error('Phase 3 (Groq): No insights extracted.');
        process.exit(1);
    }

    // 2. Step 2 (Gemini API): Generate final executive summary and weekly pulse
    const finalReport = await geminiService.generatePulse(groqInsights);
    if (!finalReport) {
        logger.error('Phase 3 (Gemini): Final report generation failed.');
        process.exit(1);
    }

    // Ensure reports directory exists
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save outputs
    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
    if (finalReport.weekly_pulse) {
        fs.writeFileSync(pulsePath, JSON.stringify(finalReport.weekly_pulse, null, 2));
    }

    logger.info(`Phase 3 Complete: AI-Powered multi-model reports saved to ${reportsDir}`);
  } catch (error) {
    logger.error(`Phase 3 Run Failed: ${error.message}`);
    process.exit(1);
  }
}

run();
