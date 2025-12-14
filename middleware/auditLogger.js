/**
 * Security Audit Logging Middleware
 * Logs security-related events for monitoring and compliance
 */

const SecurityAuditLog = require('../models/SecurityAuditLog');

/**
 * Get client IP address from request
 */
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
};

/**
 * Get user agent from request
 */
const getUserAgent = (req) => {
  return req.headers['user-agent'] || 'unknown';
};

/**
 * Create audit log entry
 */
const createAuditLog = async (data) => {
  try {
    // Only log if security events logging is enabled
    if (process.env.LOG_SECURITY_EVENTS === 'false') {
      return;
    }

    await SecurityAuditLog.createLog({
      ...data,
      timestamp: new Date()
    });
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error('Error creating audit log:', error.message);
  }
};

/**
 * Log authentication events
 */
const logAuthEvent = async (req, eventType, status, details = {}) => {
  const userId = req.user?._id || req.user?.id || null;
  const username = req.user?.username || req.body?.email || req.body?.username || null;
  const userRole = req.user?.role || null;

  await createAuditLog({
    eventType,
    userId,
    username,
    userRole,
    ipAddress: getClientIP(req),
    userAgent: getUserAgent(req),
    status,
    details,
    severity: status === 'failure' ? 'medium' : 'low'
  });
};

/**
 * Log authorization events
 */
const logAuthzEvent = async (req, eventType, status, resourceType = null, resourceId = null, details = {}) => {
  const userId = req.user?._id || req.user?.id || null;
  const username = req.user?.username || null;
  const userRole = req.user?.role || null;

  await createAuditLog({
    eventType,
    userId,
    username,
    userRole,
    ipAddress: getClientIP(req),
    userAgent: getUserAgent(req),
    resourceType,
    resourceId,
    status,
    details,
    severity: status === 'blocked' ? 'high' : status === 'failure' ? 'medium' : 'low'
  });
};

/**
 * Log security events (suspicious activity, attacks, etc.)
 */
const logSecurityEvent = async (req, eventType, severity = 'medium', details = {}) => {
  const userId = req.user?._id || req.user?.id || null;
  const username = req.user?.username || null;
  const userRole = req.user?.role || null;

  await createAuditLog({
    eventType,
    userId,
    username,
    userRole,
    ipAddress: getClientIP(req),
    userAgent: getUserAgent(req),
    status: 'blocked',
    details,
    severity
  });
};

/**
 * Log data access events
 */
const logDataAccessEvent = async (req, resourceType, resourceId, action, details = {}) => {
  const userId = req.user?._id || req.user?.id || null;
  const username = req.user?.username || null;
  const userRole = req.user?.role || null;

  await createAuditLog({
    eventType: 'sensitive_data_accessed',
    userId,
    username,
    userRole,
    ipAddress: getClientIP(req),
    userAgent: getUserAgent(req),
    resourceType,
    resourceId,
    action,
    status: 'success',
    details,
    severity: 'low'
  });
};

/**
 * Middleware to log all requests (optional, can be enabled for debugging)
 */
const auditLogger = (req, res, next) => {
  // Log only if explicitly enabled
  if (process.env.AUDIT_ALL_REQUESTS === 'true') {
    // Log after response is sent
    res.on('finish', () => {
      if (req.user) {
        logDataAccessEvent(
          req,
          'api',
          req.path,
          req.method,
          {
            statusCode: res.statusCode,
            responseTime: Date.now() - req.startTime
          }
        );
      }
    });
    
    req.startTime = Date.now();
  }
  
  next();
};

/**
 * Middleware to log permission denials
 */
const logPermissionDenial = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(body) {
    if (res.statusCode === 403) {
      logAuthzEvent(
        req,
        'permission_denied',
        'blocked',
        req.params.resourceType || 'api',
        req.params.id || req.params.resourceId || null,
        {
          path: req.path,
          method: req.method,
          reason: body.message || 'Insufficient permissions'
        }
      );
    }
    
    return originalJson.call(this, body);
  };
  
  next();
};

module.exports = {
  createAuditLog,
  logAuthEvent,
  logAuthzEvent,
  logSecurityEvent,
  logDataAccessEvent,
  auditLogger,
  logPermissionDenial,
  getClientIP,
  getUserAgent
};

