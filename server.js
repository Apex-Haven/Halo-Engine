const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { MockUserService } = require('./services/mockUserService');
const { MockVendorService } = require('./services/mockVendorService');
const { MockTransferService } = require('./services/mockTransferService');
const { MockHotelService } = require('./services/mockHotelService');
require('dotenv').config();

// Validate environment variables before starting
const { validateEnv } = require('./config/env');
validateEnv();

const app = express();
const PORT = process.env.PORT || 7007;

// Import routes
const authRoutes = require('./routes/auth');
const transferRoutes = require('./routes/transfers');
const trackingRoutes = require('./routes/tracking');
const vendorRoutes = require('./routes/vendors');
const flightRoutes = require('./routes/flights');
const notificationRoutes = require('./routes/notifications');
const aiRoutes = require('./routes/ai');
const flightTrackingRoutes = require('./routes/flightTracking');
const userRoutes = require('./routes/users');
const travelerRoutes = require('./routes/travelers');
const driverRoutes = require('./routes/drivers');
const flightIntegrationRoutes = require('./routes/flightIntegration');
const hotelRoutes = require('./routes/hotels');
const travelAdvisoryRoutes = require('./routes/travelAdvisory');

// Import services
const cronService = require('./services/cronService');

// Security middleware - Enhanced Helmet configuration
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  permittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  crossOriginOpenerPolicy: false, // Disable for API compatibility
  crossOriginResourcePolicy: {
    policy: 'cross-origin' // Allow cross-origin resources for API
  }
}));

// Enhanced CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [
    'http://localhost:7070',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || !isProduction) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400 // 24 hours
}));

// Enhanced rate limiting
const { generalLimiter, createRateLimiterWithWhitelist } = require('./middleware/rateLimiter');

// In development, use a more lenient rate limiter that allows localhost
const rateLimiter = process.env.NODE_ENV === 'production' 
  ? generalLimiter 
  : createRateLimiterWithWhitelist({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
      message: 'Too many requests, please try again later.'
    });

app.use(rateLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization middleware (must be after body parsing)
const { sanitize } = require('./middleware/sanitize');
app.use(sanitize);

// Request size validation
const { requestSizeValidation } = require('./middleware/requestLimits');
app.use(requestSizeValidation);

// Secure logging middleware (masks sensitive data)
const { secureLogging } = require('./middleware/logging');
app.use(secureLogging);

// Audit logging middleware
const { auditLogger, logPermissionDenial } = require('./middleware/auditLogger');
app.use(auditLogger);
app.use(logPermissionDenial);

// Logging middleware
app.use(morgan('combined'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/flight-tracking', flightTrackingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/travelers', travelerRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/flight-integration', flightIntegrationRoutes);
app.use('/api/hotels', hotelRoutes);
app.use('/api/travel-advisory', travelAdvisoryRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry',
      field: Object.keys(err.keyValue)[0]
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
  
  // Default error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Database connection
const connectDB = require('./config/database');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
  process.exit(0);
});

// Start server
const startServer = async () => {
  const dbConnection = await connectDB();
  
  // Initialize mock data only if MongoDB is NOT connected
  if (mongoose.connection.readyState !== 1) {
    console.log('📦 Initializing mock data for demo mode...');
    await MockUserService.initializeMockUsers();
    await MockVendorService.initializeMockVendors();
    await MockTransferService.initializeMockTransfers();
    await MockHotelService.initializeMockHotels();
  } else {
    console.log('💾 Using real MongoDB database - skipping mock data initialization');
    
    // Seed super admin if it doesn't exist
    try {
      const User = require('./models/User');
      const existingSuperAdmin = await User.findOne({ email: 'superadmin@halo.com' });
      
      if (!existingSuperAdmin) {
        console.log('🌱 Seeding default Super Admin account...');
        const superAdmin = new User({
          username: 'superadmin',
          email: 'superadmin@halo.com',
          password: 'superadmin123',
          role: 'SUPER_ADMIN',
          profile: {
            firstName: 'Super',
            lastName: 'Admin',
            phone: '+1234567890'
          },
          isProtected: true,
          isActive: true,
          isEmailVerified: true,
          preferences: {
            notifications: {
              email: true,
              sms: true,
              whatsapp: true,
              push: true
            },
            language: 'en',
            timezone: 'UTC'
          }
        });
        await superAdmin.save();
        console.log('✅ Super Admin seeded: superadmin@halo.com / superadmin123');
      } else if (!existingSuperAdmin.isProtected) {
        // Update existing super admin to be protected
        existingSuperAdmin.isProtected = true;
        existingSuperAdmin.role = 'SUPER_ADMIN';
        await existingSuperAdmin.save();
        console.log('✅ Super Admin updated with protection flag');
      }
    } catch (error) {
      console.error('⚠️ Failed to seed super admin:', error.message);
    }
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 HALO Backend Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API Base URL: http://localhost:${PORT}`);
    console.log(`📋 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
    
    // Start cron jobs if database is connected
    if (mongoose.connection.readyState === 1) {
      cronService.startAllJobs();
    } else {
      console.log('⚠️ Cron jobs disabled - running in demo mode');
    }
  });
};

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;
