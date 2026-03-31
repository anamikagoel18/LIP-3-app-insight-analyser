const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const customFormat = winston.format.printf(({ level, message, timestamp, phase }) => {
    const phaseLabel = phase ? ` [${phase}]` : '';
    return `${timestamp} [${level.toUpperCase()}]${phaseLabel}: ${message}`;
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        customFormat
    ),
    transports: [
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                customFormat
            )
        })
    ]
});

// Helper to create a phase-specific logger
const createPhaseLogger = (phaseName) => {
    return {
        info: (msg) => logger.info(msg, { phase: phaseName }),
        error: (msg) => logger.error(msg, { phase: phaseName }),
        warn: (msg) => logger.warn(msg, { phase: phaseName }),
        child: (subPhase) => createPhaseLogger(`${phaseName} > ${subPhase}`)
    };
};

// Compatibility layer: allow both direct require and destructuring
logger.logger = logger;
logger.createPhaseLogger = createPhaseLogger;

module.exports = logger;
