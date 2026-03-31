const { spawn } = require('child_process');
const path = require('path');
const logger = require('../phase6_utils/logger');

function startServer() {
  logger.info('Phase 4: Starting API Server...');
  
  const server = spawn('node', ['phase4_api/server.js'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  server.on('error', (error) => {
    logger.error(`Phase 4: Server failed to start - ${error.message}`);
  });

  process.on('SIGINT', () => {
    server.kill();
    process.exit();
  });
}

startServer();
