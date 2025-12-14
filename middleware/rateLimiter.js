/**
 * Enhanced Rate Limiting Middleware
 * Provides tiered rate limiting with per-user and per-endpoint limits
 */

const rateLimit = require('express-rate-limit');
const { logSecurityEvent } = require('./auditLogger');

/**
 * Get client identifier (user ID if authenticated, IP otherwise)
 */
const getClientIdentifier = (req) => {
  if (req.user && req.user._id) {
    return `user:${req.user._id}`;
  }
  return `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
};

/**
 * Create a rate limiter with custom configuration
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // requests per window
    message = 'Too many requests from this IP, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = getClientIdentifier,
    onLimitReached = null,
    standardHeaders = true,
    legacyHeaders = false
  } = options;

  const limiter = rateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator: (req) => {
      const key = keyGenerator(req);
      return key;
    },
    handler: async (req, res) => {
      // Log rate limit exceeded event
      if (onLimitReached) {
        await onLimitReached(req, res);
      } else {
        // Default: log security event
        await logSecurityEvent(
          req,
          'rate_limit_exceeded',
          'medium',
          {
            limit: max,
            windowMs,
            identifier: getClientIdentifier(req)
          }
        );
      }

      res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil(windowMs / 1000) // seconds
      });
    }
  });

  return limiter;
};

/**
 * General API rate limiter (applied to all routes)
 */
const generalLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'production' ? 100 : 1000),
  message: 'Too many requests, please try again later.',
  keyGenerator: (req) => {
    // In development, be more lenient with localhost
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      // Allow more requests from localhost in development
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return `dev:${ip}`;
      }
    }
    return getClientIdentifier(req);
  }
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = createRateLimiter({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5, // 5 login attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful logins
  onLimitReached: async (req, res) => {
    await logSecurityEvent(
      req,
      'brute_force_attempt',
      'high',
      {
        endpoint: req.path,
        identifier: getClientIdentifier(req)
      }
    );
  }
});

/**
 * Strict rate limiter for registration endpoints
 */
const registrationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: 'Too many registration attempts, please try again later.',
  onLimitReached: async (req, res) => {
    await logSecurityEvent(
      req,
      'suspicious_activity',
      'medium',
      {
        endpoint: req.path,
        identifier: getClientIdentifier(req),
        reason: 'Multiple registration attempts'
      }
    );
  }
});

/**
 * Rate limiter for password reset endpoints
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later.',
  onLimitReached: async (req, res) => {
    await logSecurityEvent(
      req,
      'suspicious_activity',
      'medium',
      {
        endpoint: req.path,
        identifier: getClientIdentifier(req),
        reason: 'Multiple password reset attempts'
      }
    );
  }
});

/**
 * Rate limiter for sensitive operations (delete, update critical data)
 */
const sensitiveOperationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 sensitive operations per 15 minutes
  message: 'Too many sensitive operations, please try again later.',
  onLimitReached: async (req, res) => {
    await logSecurityEvent(
      req,
      'suspicious_activity',
      'high',
      {
        endpoint: req.path,
        method: req.method,
        identifier: getClientIdentifier(req),
        reason: 'Multiple sensitive operations'
      }
    );
  }
});

/**
 * Rate limiter for file uploads
 */
const fileUploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 file uploads per hour
  message: 'Too many file uploads, please try again later.'
});

/**
 * Rate limiter for API key generation
 */
const apiKeyLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 API keys per day
  message: 'Too many API key generation requests, please try again later.',
  onLimitReached: async (req, res) => {
    await logSecurityEvent(
      req,
      'suspicious_activity',
      'medium',
      {
        endpoint: req.path,
        identifier: getClientIdentifier(req),
        reason: 'Multiple API key generation attempts'
      }
    );
  }
});

/**
 * Per-user rate limiter (stricter for authenticated users)
 */
const perUserLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes per user
  keyGenerator: (req) => {
    if (req.user && req.user._id) {
      return `user:${req.user._id}`;
    }
    return `ip:${req.ip}`;
  },
  message: 'Too many requests from your account, please try again later.'
});

/**
 * Whitelist function for trusted IPs
 */
const isWhitelisted = (req) => {
  const trustedIPs = process.env.TRUSTED_IPS?.split(',').map(ip => ip.trim()) || [];
  const clientIP = req.ip || req.connection.remoteAddress;
  return trustedIPs.includes(clientIP);
};

/**
 * Create a rate limiter that skips whitelisted IPs
 */
const createRateLimiterWithWhitelist = (options = {}) => {
  const limiter = createRateLimiter(options);
  
  return (req, res, next) => {
    if (isWhitelisted(req)) {
      return next(); // Skip rate limiting for whitelisted IPs
    }
    return limiter(req, res, next);
  };
};

module.exports = {
  createRateLimiter,
  createRateLimiterWithWhitelist,
  generalLimiter,
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  sensitiveOperationLimiter,
  fileUploadLimiter,
  apiKeyLimiter,
  perUserLimiter,
  getClientIdentifier,
  isWhitelisted
};

