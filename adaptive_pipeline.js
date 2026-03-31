const fetcher = require('./phase1_data_ingestion/fetcher');
const processor = require('./phase2_processing/processor');
const fs = require('fs');
const path = require('path');
const { logger, createPhaseLogger } = require('./phase6_utils/logger');
const db = require('./phase6_utils/db');
const pipelineLogger = createPhaseLogger('PIPELINE');

const analyzer = require('./phase3_analysis/analyzer');

/**
 * Main Pipeline Entry Point
 * @param {number} targetCount - Reviews to analyze (e.g. 75)
 * @param {number} daysLimit - Days to look back (e.g. 7)
 * @param {boolean} skipAnalysis - Skip LLM phase
 */
async function runAdaptivePipeline(targetCount, daysLimit, skipAnalysis = false) {
  // Use provided args or fallback to CLI args
  const TARGET_COUNT = targetCount || parseInt(process.argv[2]); 
  const DAYS_LIMIT = daysLimit || parseInt(process.argv[3]) || 0; 
  const SKIP_ANALYSIS = skipAnalysis || process.argv.includes('--skip-analysis');

  if (isNaN(TARGET_COUNT)) {
    logger.error('CRITICAL: TARGET_COUNT is not a number. Check API arguments.');
    if (require.main === module) process.exit(1);
    throw new Error('TARGET_COUNT must be a number');
  }

const MAX_LIMIT = 10000;
const RAW_PATH = path.join(__dirname, 'data/raw_reviews.json');
const PROCESSED_PATH = path.join(__dirname, 'data/processed_reviews.json');

  let finalReviews = [];
  let skipToAnalysis = false;

  pipelineLogger.info(`Starting Adaptive Pipeline (Target: ${TARGET_COUNT}, Days: ${DAYS_LIMIT})...`);

  // --- SMART SKIP CHECK ---
  if (fs.existsSync(PROCESSED_PATH)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
      // Handle both old array format and new object format
      const reviews = Array.isArray(existingData) ? existingData : existingData.reviews;
      const meta = Array.isArray(existingData) ? null : existingData.metadata;

      if (reviews && reviews.length >= TARGET_COUNT) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - DAYS_LIMIT);
        const validReviews = reviews.filter(r => new Date(r.date) >= cutoff);

        // STRICTOR CHECK: We only skip if we have at least TARGET_COUNT fresh reviews found locally
        if (validReviews.length >= TARGET_COUNT) {
          // Check Freshness (24h)
          const isFresh = meta && meta.last_updated && (new Date() - new Date(meta.last_updated) < 24 * 60 * 60 * 1000);
          
          if (isFresh || !meta) {
            pipelineLogger.info(`Smart Skip: Local data is sufficient and fresh (${validReviews.length} >= ${TARGET_COUNT}). Skipping Phase 1 & 2.`);
            finalReviews = validReviews;
            skipToAnalysis = true;
          }
        } else {
            pipelineLogger.info(`Smart Skip: Insufficient local data (${validReviews.length} < ${TARGET_COUNT}). Proceeding to fetch.`);
        }
      }
    } catch (e) {
      pipelineLogger.warn('Could not parse existing processed reviews for Smart Skip.');
    }
  }

  if (!skipToAnalysis) {
    let currentFetchLimit = Math.max(TARGET_COUNT * 2, 2000);
    while (currentFetchLimit <= MAX_LIMIT) {
      try {
        logger.info(`Phase 1: Multi-Source Fetch starting for up to ${currentFetchLimit} raw reviews...`);
        let rawReviews = await fetcher.fetchReviews(currentFetchLimit);
        const rawCount = rawReviews.length;
        
        // 1. DEDUPLICATION (Already handled in fetcher, but ensuring for flow)
        const uniqueRawCount = rawCount;

        // 2. DATE FILTERING (STRICT)
        let dateFilteredReviews = [];
        if (DAYS_LIMIT > 0) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - DAYS_LIMIT);
          dateFilteredReviews = rawReviews.filter(r => new Date(r.at || r.date) >= cutoff);
        } else {
          dateFilteredReviews = rawReviews;
        }
        const filteredCount = dateFilteredReviews.length;

        // --- NEW: PHASE 6 DB PERSISTENCE ---
        pipelineLogger.info(`Persistence: Upserting ${filteredCount} reviews into SQLite...`);
        dateFilteredReviews.forEach(r => db.upsertReview(r));

        if (!fs.existsSync(path.dirname(RAW_PATH))) {
          fs.mkdirSync(path.dirname(RAW_PATH), { recursive: true });
        }
        fs.writeFileSync(RAW_PATH, JSON.stringify(dateFilteredReviews, null, 2));

        // 3. SIGNAL PROCESSING (QUALITY)
        pipelineLogger.info('Phase 2: Processing high-signal filters on recent reviews...');
        const processedReviews = processor.process(dateFilteredReviews);
        const highSignalCount = processedReviews.length;

        pipelineLogger.info(`FUNNEL TRACE -> Raw (Multi-Sort): ${rawCount} | Recent (${DAYS_LIMIT}d): ${filteredCount} | High-Signal: ${highSignalCount} (Target: ${TARGET_COUNT})`);

        // 4. APPLYING LIMIT (STRICT)
        finalReviews = processedReviews.slice(0, TARGET_COUNT);

        if (finalReviews.length >= TARGET_COUNT || currentFetchLimit >= MAX_LIMIT) {
          break;
        }

        // Aggregate even more broadly if target still not met
        currentFetchLimit += 3000;
        pipelineLogger.info(`Target not met (${finalReviews.length}/${TARGET_COUNT}). Expanding broad search to ${currentFetchLimit}...`);
      } catch (error) {
        logger.error(`Pipeline Error: ${error.message}`);
        process.exit(1);
      }
    }
  }

  // Save final processed reviews with metadata for this specific run
  const outputData = {
    metadata: {
      review_count: finalReviews.length,
      time_range: DAYS_LIMIT,
      last_updated: new Date().toISOString()
    },
    reviews: finalReviews
  };
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(outputData, null, 2));
  logger.info(`[PIPELINE] Final Output: ${finalReviews.length} reviews prepared for analysis.`);

  // 3. AI Analysis Phase
  if (SKIP_ANALYSIS) {
    pipelineLogger.info('Skipping Node.js Analysis Phase as requested.');
    return;
  }

  try {
    logger.info(`Phase 3: Starting AI analysis for ${finalReviews.length} reviews...`);
    const finalReport = await analyzer.analyze(finalReviews);
    
    if (finalReport && finalReport.weekly_pulse) {
      const PULSE_PATH = path.join(__dirname, 'reports/weekly_pulse.json');
      const REPORT_PATH = path.join(__dirname, 'reports/weekly_report.json');
      
      if (!fs.existsSync(path.dirname(PULSE_PATH))) {
        fs.mkdirSync(path.dirname(PULSE_PATH), { recursive: true });
      }
      
      finalReport.weekly_pulse.review_limit = TARGET_COUNT;
      finalReport.weekly_pulse.time_range = DAYS_LIMIT;
      finalReport.weekly_pulse.total_reviews_analyzed = finalReviews.length;
      finalReport.weekly_pulse.timestamp = new Date().toISOString();
      finalReport.weekly_pulse.timestamp = new Date().toISOString();
      finalReport.weekly_pulse.analysis_status = 'success';
      
      // --- NEW: PHASE 6 DB PERSISTENCE ---
      pipelineLogger.info('Persistence: Saving final Pulse report to SQLite...');
      db.savePulseReport(finalReport.weekly_pulse);

      fs.writeFileSync(PULSE_PATH, JSON.stringify(finalReport.weekly_pulse, null, 2));
      fs.writeFileSync(REPORT_PATH, JSON.stringify(finalReport, null, 2));
      pipelineLogger.info(`Analysis Result: Success. limit: ${TARGET_COUNT}`);
    } else {
      throw new Error('Analysis yielded no report.');
    }
  } catch (err) {
    logger.error(`Analysis Phase failed: ${err.message}`);
    
    // EMERGENCY METADATA SYNC: Even if analysis fails, we must update the sync headers 
    // to prevent the UI from being permanently "Out of Sync".
    const PULSE_PATH = path.join(__dirname, 'reports/weekly_pulse.json');
    if (fs.existsSync(PULSE_PATH)) {
      try {
        const pulse = JSON.parse(fs.readFileSync(PULSE_PATH, 'utf8'));
        pulse.review_limit = TARGET_COUNT;
        pulse.time_range = DAYS_LIMIT;
        pulse.analysis_status = 'failed';
        pulse.error_message = err.message;
        pulse.timestamp = new Date().toISOString();
        fs.writeFileSync(PULSE_PATH, JSON.stringify(pulse, null, 2));
        logger.warn(`DEBUG: POST-ANALYSIS -> Error handled. review_limit synced to ${TARGET_COUNT}`);
      } catch (e) {
        logger.error('Failed to sync emergency metadata.');
      }
    }
  }

  logger.info('Adaptive Pipeline complete.');
}

// --- MODULE EXPORT ---
module.exports = { runAdaptivePipeline };

// --- CLI EXECUTION ---
if (require.main === module) {
  runAdaptivePipeline();
}
