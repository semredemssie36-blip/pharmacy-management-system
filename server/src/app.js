import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import env from './config/env.js';
import requestLogger from './middleware/requestLogger.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app = express();

// Basic request handling middleware
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// API routes — all business endpoints are versioned under /api/v1
app.use('/api/v1', routes);

// 404 + centralized error handling (must be registered last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
