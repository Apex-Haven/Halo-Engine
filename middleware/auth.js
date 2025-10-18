const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'halo_secret_key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Authentication error.',
      error: error.message
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Permission-based authorization middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    let hasPermission = false;

    switch (permission) {
      case 'manage_users':
        hasPermission = req.user.canManageUsers();
        break;
      case 'manage_vendors':
        hasPermission = req.user.canManageVendors();
        break;
      case 'manage_drivers':
        hasPermission = req.user.canManageDrivers();
        break;
      case 'send_notifications':
        hasPermission = req.user.canSendNotifications();
        break;
      case 'view_reports':
        hasPermission = req.user.canViewReports();
        break;
      case 'manage_settings':
        hasPermission = req.user.canManageSettings();
        break;
      case 'access_transfer':
        // This will be checked with specific transfer ID
        hasPermission = true;
        break;
      default:
        hasPermission = false;
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Permission '${permission}' required.`
      });
    }

    next();
  };
};

// Resource-based authorization middleware
const authorizeResource = (resourceType) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    try {
      let hasAccess = false;
      const resourceId = req.params.id || req.params.transferId || req.params.vendorId;

      switch (resourceType) {
        case 'transfer':
          hasAccess = await checkTransferAccess(req.user, resourceId);
          break;
        case 'vendor':
          hasAccess = await checkVendorAccess(req.user, resourceId);
          break;
        case 'driver':
          hasAccess = await checkDriverAccess(req.user, resourceId);
          break;
        default:
          hasAccess = false;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to access this resource.'
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Authorization error.',
        error: error.message
      });
    }
  };
};

// Helper functions for resource access checks
const checkTransferAccess = async (user, transferId) => {
  if (!transferId) return false;

  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'OPERATIONS_MANAGER':
      return true;
    
    case 'VENDOR_MANAGER':
    case 'DRIVER':
      // Check if transfer belongs to user's vendor
      const Transfer = require('../models/Transfer');
      const transfer = await Transfer.findById(transferId);
      return transfer && transfer.vendor_details.vendor_id === user.vendorId;
    
    case 'CUSTOMER':
      // Check if transfer belongs to customer
      return user.customerTransfers.includes(transferId);
    
    default:
      return false;
  }
};

const checkVendorAccess = async (user, vendorId) => {
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'OPERATIONS_MANAGER':
      return true;
    
    case 'VENDOR_MANAGER':
    case 'DRIVER':
      return user.vendorId === vendorId;
    
    default:
      return false;
  }
};

const checkDriverAccess = async (user, driverId) => {
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'OPERATIONS_MANAGER':
      return true;
    
    case 'VENDOR_MANAGER':
      // Check if driver belongs to vendor's drivers
      const Driver = require('../models/Driver');
      const driver = await Driver.findById(driverId);
      return driver && driver.vendorId === user.vendorId;
    
    case 'DRIVER':
      return user.driverId === driverId;
    
    default:
      return false;
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'halo_secret_key');
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

// Rate limiting middleware (basic implementation)
const rateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.user ? req.user._id.toString() : req.ip;
    const now = Date.now();
    
    if (!requests.has(key)) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userRequests = requests.get(key);
    
    if (now > userRequests.resetTime) {
      userRequests.count = 1;
      userRequests.resetTime = now + windowMs;
      return next();
    }
    
    if (userRequests.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.'
      });
    }
    
    userRequests.count++;
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
  requirePermission,
  authorizeResource,
  optionalAuth,
  rateLimit
};
