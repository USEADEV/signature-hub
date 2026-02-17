import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config, validateConfig } from './config';
import apiRoutes from './routes/api';
import signRoutes from './routes/sign';
import adminRoutes from './routes/admin';
import statusRoutes from './routes/status';
import { closePool } from './db/connection';
import { initializePostgres, closePool as closePgPool } from './db/postgres';
import { startExpirationChecker, stopExpirationChecker } from './services/expiration';

const app = express();

// Trust proxy (required behind reverse proxies like Railway, Heroku, etc.)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Note: 'unsafe-inline' is required for existing inline scripts in HTML files
      // TODO: Refactor to external scripts and use nonces for better security
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
}));

// Configure CORS with explicit allowed origins
const allowedOrigins = [
  config.baseUrl,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
].filter(Boolean);

app.use(cors({
  origin: config.env === 'production'
    ? (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
          return callback(null, true);
        }
        console.warn(`CORS blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
      }
    : true, // Allow all origins in development
  credentials: true,
}));
app.use(express.json({ limit: '10mb' })); // Allow large base64 signatures
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/docs', express.static(path.join(__dirname, '../docs'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.md')) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', apiRoutes);
app.use('/sign', signRoutes);
app.use('/admin', adminRoutes);
app.use('/status', statusRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function start() {
  try {
    validateConfig();

    // Initialize PostgreSQL if configured
    if (config.dbType === 'postgres') {
      await initializePostgres();
    }

    startExpirationChecker();

    app.listen(config.port, () => {
      console.log(`SignatureHub server running on port ${config.port}`);
      console.log(`Environment: ${config.env}`);
      console.log(`Database: ${config.dbType}`);
      console.log(`Base URL: ${config.baseUrl}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  stopExpirationChecker();
  if (config.dbType === 'mysql') {
    await closePool();
  } else if (config.dbType === 'postgres') {
    await closePgPool();
  }
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await shutdown();
  process.exit(0);
});

start();
