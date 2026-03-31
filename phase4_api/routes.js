const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../phase6_utils/logger');
const emailService = require('./email');

// Global State Tracker
let systemState = {
  isProcessing: false,
  progressLabel: ''
};

// 1. GET Weekly Pulse
router.get('/pulse', (req, res) => {
  const filePath = path.join(__dirname, '../reports/weekly_pulse.json');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Weekly Pulse not found. Run Phase 3 first.' });
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json(data);
});

// 2. GET Full Report
router.get('/report', (req, res) => {
  const filePath = path.join(__dirname, '../reports/weekly_report.json');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Weekly Report not found.' });
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  res.json(data);
});

// 3. POST Trigger Pipeline
router.post('/trigger', (req, res) => {
  const { limit, days } = req.body;
  const analysisScript = path.join(__dirname, '../adaptive_pipeline.js');
  
  logger.info(`DEBUG: API Trigger Received -> limit: ${limit}, days: ${days}`);
  
  if (!limit) {
    return res.status(400).json({ error: 'selected Insight Depth (limit) is required.' });
  }

  systemState.isProcessing = true;
  systemState.progressLabel = 'Initializing...';

  // Ensure strict string passing for spawn
  const argLimit = (limit || 150).toString();
  const argDays = (days || 0).toString();
  
  logger.info(`DEBUG: Spawning Pipeline -> node adaptive_pipeline.js ${argLimit} ${argDays}`);
  
  const child = spawn('node', [analysisScript, argLimit, argDays], {
     cwd: path.join(__dirname, '..')
  });
  
  child.stdout.on('data', (data) => {
    const output = data.toString();
    logger.info(`Pipeline: ${output}`);
    
    // Progress Label Extraction
    if (output.includes('Phase 1')) systemState.progressLabel = 'Fetching reviews...';
    if (output.includes('Phase 2')) systemState.progressLabel = 'Processing data...';
    if (output.includes('Phase 3')) systemState.progressLabel = 'Analyzing reviews...';
    if (output.includes('Smart Skip')) systemState.progressLabel = 'Smart Skip: Reusing data...';
  });
  
  child.stderr.on('data', (data) => logger.error(`Pipeline Error: ${data}`));
  
  child.on('exit', (code) => {
    systemState.isProcessing = false;
    systemState.progressLabel = '';
    logger.info(`API: Pipeline exited with code ${code}`);
  });
  
  res.json({ status: 'Pipeline started.', timestamp: new Date().toISOString() });
});

// 4. POST Send Email
router.post('/email', async (req, res) => {
  const { email, name } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Recipient email is required in the request body.' });
  }

  const success = await emailService.sendWeeklyPulse(email, name);
  if (success) {
    res.json({ message: `Email dispatch to ${name || email} successful.` });
  } else {
    res.status(500).json({ error: 'Failed to send email. Check server credentials and logs.' });
  }
});

// 5. GET All Processed Reviews (with filters)
router.get('/reviews', (req, res) => {
  const reviewsPath = path.join(__dirname, '../data/processed_reviews.json');
  const limit = parseInt(req.query.limit) || 100;
  const days = parseInt(req.query.days) || 0;

  if (fs.existsSync(reviewsPath)) {
    const rawData = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
    let reviews = Array.isArray(rawData) ? rawData : rawData.reviews;
    
    // Ensure chronological sort (Latest First)
    reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      reviews = reviews.filter(r => new Date(r.date) >= cutoff);
    }

    res.json(reviews.slice(0, limit));
  } else {
    res.json([]);
  }
});

// 6. GET Health/Status
router.get('/status', (req, res) => {
  let metadata = {
    status: 'online',
    isProcessing: systemState.isProcessing,
    timestamp: new Date().toISOString(),
    reviewCount: 0,
    lastAnalysisDate: 'Never',
    review_limit: 0,
    time_range: 0,
    progressLabel: systemState.progressLabel
  };

  const reviewsPath = path.join(__dirname, '../data/processed_reviews.json');
  const pulsePath = path.join(__dirname, '../reports/weekly_pulse.json');

  if (fs.existsSync(reviewsPath)) {
    const rawData = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
    const reviews = Array.isArray(rawData) ? rawData : rawData.reviews;
    metadata.reviewCount = reviews.length;
  }

  if (fs.existsSync(pulsePath)) {
    const pulse = JSON.parse(fs.readFileSync(pulsePath, 'utf8'));
    metadata.lastAnalysisDate = pulse.timestamp;
    metadata.review_limit = pulse.review_limit;
    metadata.time_range = pulse.time_range;
  }

  res.json(metadata);
});

module.exports = router;
