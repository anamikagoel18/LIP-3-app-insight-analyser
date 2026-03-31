require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('../phase6_utils/logger');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../phase5_frontend')));

// Routes
app.use('/api', apiRoutes);

// Root route redirects to dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../phase5_frontend/index.html'));
});

// Error Handling
app.use((err, req, res, next) => {
  logger.error(`API Error: ${err.message}`);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(PORT, () => {
    logger.info(`App Insight Analyser API running on http://localhost:${PORT}`);
});
