const { runAdaptivePipeline } = require('../adaptive_pipeline');
const emailService = require('../phase4_api/email');
const { createPhaseLogger } = require('./logger');

const logger = createPhaseLogger('CLOUD-RUN');
const RECIPIENT_EMAIL = 'anamikagoel2002@gmail.com';

/**
 * CI/CD Entry Point for GitHub Actions
 * Performs a full Weekly Pulse analysis and dispatches the email.
 */
async function triggerCloudPulse() {
    logger.info('--- CLOUD-RUN: STARTING AUTOMATED WEEKLY PULSE ---');
    
    try {
        // Step 1: Run Adaptive Pipeline (75 reviews, 7 days)
        // Programmatic call (targetCount, daysLimit, skipAnalysis)
        logger.info('PHASE 1: Starting Intelligence Synthesis...');
        await runAdaptivePipeline(75, 7, false);
        
        logger.info('PHASE 1 COMPLETE: Analysis results synthesized.');

        // Step 2: Dispatch Email
        logger.info(`PHASE 2: Dispatching Pulse Report to ${RECIPIENT_EMAIL}...`);
        const sent = await emailService.sendWeeklyPulse(RECIPIENT_EMAIL, 'Stakeholder');
        
        if (sent) {
            logger.info('PHASE 2 COMPLETE: Weekly Pulse delivered via cloud runner.');
        } else {
            throw new Error('Email dispatch returned false. Check SMTP configuration.');
        }

        logger.info('--- CLOUD-RUN: ALL TASKS SUCCESSFUL ---');
        process.exit(0);
    } catch (err) {
        logger.error(`--- CLOUD-RUN: CRITICAL FAILURE ---`);
        logger.error(err.message);
        process.exit(1);
    }
}

// Global timeout safety (10 minutes)
setTimeout(() => {
    logger.error('CLOUD-RUN: Execution timed out after 10 minutes.');
    process.exit(1);
}, 10 * 60 * 1000);

triggerCloudPulse();
