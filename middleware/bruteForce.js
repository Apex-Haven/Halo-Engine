/**
 * Brute Force Protection Middleware
 * Detects and prevents brute force attacks with progressive delays and IP blocking
 */

const SecurityAuditLog = require('../models/SecurityAuditLog');
const { logSecurityEvent, getClientIP } = require('./auditLogger');

// In-memory store for brute force attempts (use Redis in production)
const bruteForceStore = new Map();

// Configuration
const CONFIG = {
  MAX_ATTEMPTS: 5, // Maximum failed attempts before blocking
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes window
  BLOCK_DURATION_MS: 2 * 60 * 60 * 1000, // 2 hours block duration
  PROGRESSIVE_DELAY: true, // Enable progressive delays
  BASE_DELAY_MS: 1000, // Base delay in milliseconds
  MAX_DELAY_MS: 30000 // Maximum delay in milliseconds
};

/**
 * Get brute force entry for identifier (IP or user)
 */
const getBruteForceEntry = (identifier) => {
  const entry = bruteForceStore.get(identifier);
  
  if (!entry) {
    return null;
  }
  
  // Check if entry has expired
  if (Date.now() > entry.resetTime) {
    bruteForceStore.delete(identifier);
    return null;
  }
  
  return entry;
};

/**
 * Record a failed attempt
 */
const recordFailedAttempt = (identifier) => {
  const entry = getBruteForceEntry(identifier) || {
    attempts: 0,
    firstAttempt: Date.now(),
    resetTime: Date.now() + CONFIG.WINDOW_MS,
    blockedUntil: null
  };
  
  entry.attempts++;
  entry.lastAttempt = Date.now();
  
  // Block if max attempts exceeded
  if (entry.attempts >= CONFIG.MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + CONFIG.BLOCK_DURATION_MS;
    entry.resetTime = entry.blockedUntil; // Extend reset time to block duration
  }
  
  bruteForceStore.set(identifier, entry);
  return entry;
};

/**
 * Clear failed attempts (on successful login)
 */
const clearFailedAttempts = (identifier) => {
  bruteForceStore.delete(identifier);
};

/**
 * Check if identifier is blocked
 */
const isBlocked = (identifier) => {
  const entry = getBruteForceEntry(identifier);
  
  if (!entry || !entry.blockedUntil) {
    return false;
  }
  
  if (Date.now() < entry.blockedUntil) {
    return true;
  }
  
  // Block expired, clear entry
  bruteForceStore.delete(identifier);
  return false;
};

/**
 * Calculate progressive delay based on attempts
 */
const calculateDelay = (attempts) => {
  if (!CONFIG.PROGRESSIVE_DELAY) {
    return 0;
  }
  
  // Exponential backoff: delay = base * 2^(attempts - 1)
  const delay = Math.min(
    CONFIG.BASE_DELAY_MS * Math.pow(2, attempts - 1),
    CONFIG.MAX_DELAY_MS
  );
  
  return delay;
};

/**
 * Get remaining block time in seconds
 */
const getRemainingBlockTime = (identifier) => {
  const entry = getBruteForceEntry(identifier);
  
  if (!entry || !entry.blockedUntil) {
    return 0;
  }
  
  const remaining = entry.blockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
};

/**
 * Get attempt count for identifier
 */
const getAttemptCount = (identifier) => {
  const entry = getBruteForceEntry(identifier);
  return entry ? entry.attempts : 0;
};

/**
 * Brute force protection middleware
 */
const bruteForceProtection = (options = {}) => {
  const {
    identifier = (req) => getClientIP(req), // Default: use IP address
    onBlocked = null, // Custom handler when blocked
    onAttempt = null, // Custom handler on each attempt
    skipSuccessful = true // Skip tracking on successful requests
  } = options;

  return async (req, res, next) => {
    // Skip if brute force protection is disabled
    if (process.env.ENABLE_BRUTE_FORCE_PROTECTION === 'false') {
      return next();
    }

    const id = typeof identifier === 'function' ? identifier(req) : identifier;
    const entry = getBruteForceEntry(id);
    const attempts = entry ? entry.attempts : 0;

    // Check if blocked
    if (isBlocked(id)) {
      const remainingTime = getRemainingBlockTime(id);
      
      // Log security event
      await logSecurityEvent(
        req,
        'brute_force_attempt',
        'high',
        {
          identifier: id,
          attempts,
          blocked: true,
          remainingBlockTime: remainingTime
        }
      );

      // Custom handler or default response
      if (onBlocked) {
        return onBlocked(req, res, remainingTime);
      }

      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Your IP has been temporarily blocked.',
        retryAfter: remainingTime,
        blockedUntil: new Date(Date.now() + remainingTime * 1000).toISOString()
      });
    }

    // Add progressive delay if there are previous attempts
    if (attempts > 0 && CONFIG.PROGRESSIVE_DELAY) {
      const delay = calculateDelay(attempts);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Store original response methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override response methods to track success/failure
    res.json = function(body) {
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      
      if (isSuccess && skipSuccessful) {
        // Clear failed attempts on success
        clearFailedAttempts(id);
      } else if (!isSuccess && res.statusCode === 401) {
        // Record failed attempt
        const newEntry = recordFailedAttempt(id);
        
        if (onAttempt) {
          onAttempt(req, newEntry);
        }

        // Log if approaching block threshold
        if (newEntry.attempts >= CONFIG.MAX_ATTEMPTS - 1) {
          logSecurityEvent(
            req,
            'brute_force_attempt',
            'high',
            {
              identifier: id,
              attempts: newEntry.attempts,
              warning: 'Approaching block threshold'
            }
          );
        }
      }

      return originalJson.call(this, body);
    };

    res.send = function(body) {
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
      
      if (isSuccess && skipSuccessful) {
        clearFailedAttempts(id);
      } else if (!isSuccess && res.statusCode === 401) {
        recordFailedAttempt(id);
      }

      return originalSend.call(this, body);
    };

    next();
  };
};

/**
 * Cleanup old entries (should be called periodically)
 */
const cleanupOldEntries = () => {
  const now = Date.now();
  for (const [identifier, entry] of bruteForceStore.entries()) {
    if (now > entry.resetTime) {
      bruteForceStore.delete(identifier);
    }
  }
};

// Cleanup every 5 minutes
setInterval(cleanupOldEntries, 5 * 60 * 1000);

/**
 * Get brute force statistics
 */
const getStatistics = () => {
  const stats = {
    totalEntries: bruteForceStore.size,
    blockedEntries: 0,
    totalAttempts: 0
  };

  for (const entry of bruteForceStore.values()) {
    if (entry.blockedUntil && Date.now() < entry.blockedUntil) {
      stats.blockedEntries++;
    }
    stats.totalAttempts += entry.attempts;
  }

  return stats;
};

module.exports = {
  bruteForceProtection,
  recordFailedAttempt,
  clearFailedAttempts,
  isBlocked,
  getRemainingBlockTime,
  getAttemptCount,
  getStatistics,
  cleanupOldEntries
};

