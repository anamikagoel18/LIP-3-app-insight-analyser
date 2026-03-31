require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('../phase6_utils/logger');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api', routes);

app.use((err, req, res, next) => {
  logger.error(`Phase 4 Error: ${err.message}\n${err.stack}`);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  logger.info(`Phase 4: API Server running on port ${PORT}`);
});

module.exports = app;
