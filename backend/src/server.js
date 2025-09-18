const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import startup service
const startupService = require('./utils/startup');
// Import request logger middleware
const requestLogger = require('./middleware/requestLogger');
// Import progress logger middleware
const progressLogger = require('./middleware/progressLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173';
console.log('🌐 CORS enabled for:', corsOrigin);
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set timeout for all requests (20 minutes for large file processing)
app.use((req, res, next) => {
  // Set timeout to 20 minutes (1200000ms)
  req.setTimeout(1200000);
  res.setTimeout(1200000);
  next();
});

// Request logging middleware
app.use(requestLogger.middleware());

// Progress tracking middleware
app.use(progressLogger.middleware());

// HTTP logging
app.use(morgan('combined'));

// Routes
const documentRoutes = require('./routes/documentRoutes');
const searchRoutes = require('./routes/searchRoutes');
const similarityRoutes = require('./routes/similarityRoutes');

app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/similarity', similarityRoutes);

// Progress monitoring routes
app.get('/api/progress', progressLogger.getProgressRoute());
app.get('/api/progress/:requestId', progressLogger.getProgressRoute());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use(requestLogger.errorMiddleware());
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function startServer() {
  try {
    // Initialize services
    await startupService.initialize();
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;