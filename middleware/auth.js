const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJWTSecret } = require('../config/env');

// Authentication middleware
const authenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  try {
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const jwtSecret = getJWTSecret();
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      // Log failed authentication attempt
      const clientInfo = {
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date().toISOString(),
        userId: decoded.userId,
        reason: !user ? 'user_not_found' : 'user_inactive'
      };
      console.log('🚨 Authentication failed:', JSON.stringify(clientInfo));
      
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found.'
      });
    }

    // Log successful authentication
    const authLog = {
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      timestamp: new Date().toISOString(),
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name || 'N/A'
    };
    console.log('✅ Authentication success:', JSON.stringify(authLog));

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      const clientInfo = {
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date().toISOString(),
        error: 'invalid_token',
        token: token ? token.substring(0, 20) + '...' : '(none)'
      };
      console.log('🚨 JWT Error:', JSON.stringify(clientInfo));
      
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      const clientInfo = {
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date().toISOString(),
        error: 'token_expired',
        expiredAt: error.expiredAt
      };
      console.log('⏰ Token Expired:', JSON.stringify(clientInfo));
      
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    const errorInfo = {
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    };
    console.log('💥 Authentication Error:', JSON.stringify(errorInfo));

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

    // Flatten the roles array in case it's nested
    const flatRoles = roles.flat();

    if (!flatRoles.includes(req.user.role)) {
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
      case 'manage_clients':
        hasPermission = req.user.canManageClients();
        break;
      case 'manage_drivers':
        hasPermission = req.user.canManageDrivers();
        break;
      case 'manage_travelers':
        hasPermission = req.user.canManageTravelers();
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
      return true;
    
    case 'VENDOR':
    case 'DRIVER':
      // Check if transfer belongs to user's vendor
      const Transfer = require('../models/Transfer');
      const transfer = await Transfer.findById(transferId);
      if (!transfer) return false;
      const vendorIdToCheck = user.role === 'VENDOR' ? user._id.toString() : user.vendorId?.toString();
      const transferVendorId = (transfer.vendor_details && transfer.vendor_details.vendor_id)
        ? String(transfer.vendor_details.vendor_id)
        : null;
      return !!transferVendorId && transferVendorId === vendorIdToCheck;
    
    case 'CLIENT':
    case 'TRAVELER':
      const TransferModel = require('../models/Transfer');
      const t = await TransferModel.findById(transferId).select('customer_id traveler_id').lean();
      if (!t) return false;
      if (user.role === 'CLIENT') {
        return t.customer_id && String(t.customer_id) === String(user._id);
      }
      return t.traveler_id && String(t.traveler_id) === String(user._id);
    
    default:
      return false;
  }
};

const checkVendorAccess = async (user, vendorId) => {
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return true;
    
    case 'VENDOR':
      return user._id.toString() === vendorId;
    
    case 'DRIVER':
      return user.vendorId === vendorId;
    
    case 'CLIENT':
      // Client can see vendors assigned to them
      const client = await User.findById(user._id).populate('assignedVendors');
      return client.assignedVendors.some(v => v._id.toString() === vendorId);
    
    default:
      return false;
  }
};

const checkDriverAccess = async (user, driverId) => {
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return true;
    
    case 'VENDOR':
      // Check if driver belongs to vendor's drivers
      const driver = await User.findById(driverId);
      return driver && driver.role === 'DRIVER' && driver.vendorId === user._id.toString();
    
    case 'DRIVER':
      return user.driverId === driverId || user._id.toString() === driverId;
    
    default:
      return false;
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const jwtSecret = getJWTSecret();
      const decoded = jwt.verify(token, jwtSecret);
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
