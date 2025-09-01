const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// استيراد جميع المسارات
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/events');
const ticketRoutes = require('./routes/tickets');
const analyticsRoutes = require('./routes/analytics');

const app = express();

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://imaginative-torrone-ce6869.netlify.app',
    'https://*.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB Connected Successfully');
  console.log(`📊 Database: ${mongoose.connection.name}`);
})
.catch((err) => {
  console.error('❌ MongoDB Connection Error:', err.message);
  process.exit(1);
});

// MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('📈 MongoDB connection established');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB connection disconnected');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    message: 'EventX Server is running successfully',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      name: mongoose.connection.name,
      host: mongoose.connection.host
    }
  };
  res.json(healthStatus);
});

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: '🎉 EventX Studio API is running!',
    version: '1.0.0',
    documentation: '/api/health',
    endpoints: {
      auth: '/api/auth',
      events: '/api/events',
      tickets: '/api/tickets',
      analytics: '/api/analytics'
    }
  });
});

// API documentation route
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'EventX API Documentation',
    version: '1.0.0',
    description: 'Comprehensive API for Event Management System',
    baseURL: process.env.CLIENT_URL || 'http://localhost:5000',
    endpoints: {
      auth: {
        'POST /register': 'Register new user',
        'POST /login': 'User login',
        'GET /profile': 'Get user profile'
      },
      events: {
        'GET /': 'Get all events with filtering',
        'GET /:id': 'Get single event',
        'POST /': 'Create event (Admin only)',
        'PUT /:id': 'Update event (Admin only)',
        'DELETE /:id': 'Delete event (Admin only)',
        'GET /:id/seats': 'Get event seating',
        'POST /:id/reserve-seat': 'Reserve seat',
        'POST /:id/cancel-seat': 'Cancel reservation'
      },
      tickets: {
        'GET /my-tickets': 'Get user tickets',
        'POST /book': 'Book ticket',
        'POST /cancel/:ticketId': 'Cancel ticket',
        'GET /:ticketId': 'Get ticket details'
      },
      analytics: {
        'GET /dashboard': 'Dashboard statistics (Admin only)',
        'GET /events/:id': 'Event analytics (Admin only)',
        'GET /export/:eventId?': 'Export tickets (Admin only)'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  const errorResponse = {
    message: 'Something went wrong!',
    errorId: Date.now()
  };

  // إظهار تفاصيل الخطأ في البيئة التطويرية فقط
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.details = err.message;
  }

  res.status(err.status || 500).json(errorResponse);
});

// 404 handler
app.use('*', (req, res) => {
  const availableEndpoints = [
    { path: '/api/auth', methods: ['GET', 'POST'] },
    { path: '/api/events', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { path: '/api/tickets', methods: ['GET', 'POST'] },
    { path: '/api/analytics', methods: ['GET'] },
    { path: '/api/health', methods: ['GET'] },
    { path: '/api/docs', methods: ['GET'] }
  ];

  res.status(404).json({
    message: 'API endpoint not found',
    requested: {
      path: req.originalUrl,
      method: req.method
    },
    availableEndpoints,
    suggestion: 'Check /api/docs for complete API documentation'
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server is running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`📚 Docs: http://localhost:${PORT}/api/docs`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    // Close MongoDB connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    }
    
    console.log('👋 Shutdown complete');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle different shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = app;