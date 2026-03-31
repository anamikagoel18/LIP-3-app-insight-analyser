const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const emailService = require('../phase4_api/email');
const { createPhaseLogger } = require('./logger');

const logger = createPhaseLogger('SCHEDULER');
const RECIPIENT_EMAIL = 'anamikagoel2002@gmail.com';

// SCHEDULE 1: Processing Phase (12:15 PM IST every Tuesday)
const PROCESSING_SCHEDULE = '15 12 * * 2';

// SCHEDULE 2: Dispatch Phase (12:27 PM IST every Tuesday)
const DISPATCH_SCHEDULE = '27 12 * * 2';

const TIMEZONE = "Asia/Kolkata";

logger.info(`Scheduler Re-initialized.`);
logger.info(`Phase 1 (Processing): ${PROCESSING_SCHEDULE} (IST)`);
logger.info(`Phase 2 (Dispatch): ${DISPATCH_SCHEDULE} (IST) to ${RECIPIENT_EMAIL}`);

// --- TRIGGER 1: WEEKLY PROCESSING ---
cron.schedule(PROCESSING_SCHEDULE, async () => {
    logger.info('--- PHASE 1: WEEKLY PROCESSING TRIGGERED ---');
    
    const pipelinePath = path.join(__dirname, '../adaptive_pipeline.js');
    
    // Run Adaptive Pipeline (75 reviews, 7 days)
    const pipeline = spawn('node', [pipelinePath, '75', '7']);

    pipeline.stdout.on('data', (data) => {
        logger.info(`PIPELINE: ${data.toString().trim()}`);
    });

    pipeline.stderr.on('data', (data) => {
        logger.error(`PIPELINE_ERROR: ${data.toString().trim()}`);
    });

    pipeline.on('close', (code) => {
        if (code === 0) {
            logger.info('PHASE 1 COMPLETE: Analysis results saved to weekly_pulse.json');
        } else {
            logger.error(`PHASE 1 FAILED: Exit code ${code}`);
        }
    });

}, {
    scheduled: true,
    timezone: TIMEZONE
});

// --- TRIGGER 2: WEEKLY DISPATCH ---
cron.schedule(DISPATCH_SCHEDULE, async () => {
    logger.info('--- PHASE 2: WEEKLY DISPATCH TRIGGERED ---');
    
    try {
        const sent = await emailService.sendWeeklyPulse(RECIPIENT_EMAIL, 'Stakeholder');
        if (sent) {
            logger.info(`PHASE 2 COMPLETE: Weekly Pulse delivered to ${RECIPIENT_EMAIL}`);
        } else {
            logger.error('PHASE 2 FAILED: Email dispatch returned failure.');
        }
    } catch (err) {
        logger.error(`PHASE 2 CRITICAL ERROR: ${err.message}`);
    }

}, {
    scheduled: true,
    timezone: TIMEZONE
});
