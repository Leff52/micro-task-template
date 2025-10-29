import { randomUUID } from 'crypto'
import { logger } from '../utils/logger.js'

export function requestLogger(req, res, next) {
	const requestId = req.headers['x-request-id'] || randomUUID()
	req.requestId = requestId
	res.setHeader('X-Request-Id', requestId)

	const start = Date.now()
	logger.info(
		{
			service: process.env.SERVICE_NAME,
			requestId,
			method: req.method,
			url: req.originalUrl,
		},
		'Incoming request'
	)

	res.on('finish', () => {
		const duration = Date.now() - start
		logger.info(
			{
				service: process.env.SERVICE_NAME,
				requestId,
				status: res.statusCode,
				duration,
			},
			'Request completed'
		)
	})

	next()
}
