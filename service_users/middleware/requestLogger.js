const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  logger.info(
    {
      service: process.env.SERVICE_NAME || 'users',
      requestId,
      method: req.method,
      url: req.originalUrl,
    },
    'Request started'
  );

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        service: process.env.SERVICE_NAME || 'users',
        requestId,
        status: res.statusCode,
        duration,
      },
      'Request completed'
    );
  });

  next();
}

module.exports = { requestLogger };