/**
 * Request Size Limits Middleware
 * Enforces per-endpoint request size limits and validation
 */

const { logSecurityEvent } = require('./auditLogger');

/**
 * Default size limits (in bytes)
 */
const DEFAULT_LIMITS = {
  json: 10 * 1024 * 1024, // 10MB
  urlencoded: 10 * 1024 * 1024, // 10MB
  text: 1 * 1024 * 1024, // 1MB
  raw: 10 * 1024 * 1024, // 10MB
  array: 100, // Max array length
  depth: 10 // Max JSON depth
};

/**
 * Per-endpoint size limits
 */
const ENDPOINT_LIMITS = {
  '/api/auth/register': {
    json: 50 * 1024, // 50KB
    depth: 5
  },
  '/api/auth/login': {
    json: 10 * 1024, // 10KB
    depth: 3
  },
  '/api/transfers': {
    json: 5 * 1024 * 1024, // 5MB
    depth: 8
  },
  '/api/users': {
    json: 2 * 1024 * 1024, // 2MB
    depth: 6
  },
  '/api/upload': {
    json: 50 * 1024 * 1024, // 50MB for file uploads
    depth: 5
  }
};

/**
 * Calculate request size
 */
const calculateRequestSize = (req) => {
  let size = 0;
  
  // URL length
  size += (req.url || '').length;
  
  // Headers size (approximate)
  size += JSON.stringify(req.headers || {}).length;
  
  // Body size
  if (req.body) {
    size += JSON.stringify(req.body).length;
  }
  
  // Query string size
  if (req.query) {
    size += JSON.stringify(req.query).length;
  }
  
  // Params size
  if (req.params) {
    size += JSON.stringify(req.params).length;
  }
  
  return size;
};

/**
 * Calculate JSON depth
 */
const calculateDepth = (obj, currentDepth = 0) => {
  if (obj === null || obj === undefined) {
    return currentDepth;
  }
  
  if (typeof obj !== 'object') {
    return currentDepth;
  }
  
  if (Array.isArray(obj)) {
    let maxDepth = currentDepth;
    for (const item of obj) {
      const depth = calculateDepth(item, currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
    return maxDepth;
  }
  
  let maxDepth = currentDepth;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const depth = calculateDepth(obj[key], currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  
  return maxDepth;
};

/**
 * Validate array length
 */
const validateArrayLength = (obj, maxLength = DEFAULT_LIMITS.array) => {
  if (Array.isArray(obj)) {
    if (obj.length > maxLength) {
      return {
        valid: false,
        message: `Array length ${obj.length} exceeds maximum allowed length of ${maxLength}`
      };
    }
  }
  
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const result = validateArrayLength(obj[key], maxLength);
        if (!result.valid) {
          return result;
        }
      }
    }
  }
  
  return { valid: true };
};

/**
 * Get limits for endpoint
 */
const getEndpointLimits = (path) => {
  // Find matching endpoint (exact match or prefix match)
  for (const [endpoint, limits] of Object.entries(ENDPOINT_LIMITS)) {
    if (path === endpoint || path.startsWith(endpoint)) {
      return { ...DEFAULT_LIMITS, ...limits };
    }
  }
  
  return DEFAULT_LIMITS;
};

/**
 * Request size validation middleware
 */
const requestSizeValidation = (req, res, next) => {
  try {
    const limits = getEndpointLimits(req.path);
    const requestSize = calculateRequestSize(req);
    
    // Check total request size
    if (requestSize > limits.json) {
      logSecurityEvent(
        req,
        'invalid_input_detected',
        'medium',
        {
          reason: 'Request size exceeded',
          path: req.path,
          size: requestSize,
          limit: limits.json
        }
      );
      
      return res.status(413).json({
        success: false,
        message: `Request size ${(requestSize / 1024).toFixed(2)}KB exceeds maximum allowed size of ${(limits.json / 1024).toFixed(2)}KB`
      });
    }
    
    // Check JSON depth if body exists
    if (req.body && typeof req.body === 'object') {
      const depth = calculateDepth(req.body);
      
      if (depth > limits.depth) {
        logSecurityEvent(
          req,
          'invalid_input_detected',
          'medium',
          {
            reason: 'JSON depth exceeded',
            path: req.path,
            depth,
            limit: limits.depth
          }
        );
        
        return res.status(400).json({
          success: false,
          message: `JSON depth ${depth} exceeds maximum allowed depth of ${limits.depth}`
        });
      }
      
      // Check array lengths
      const arrayValidation = validateArrayLength(req.body, limits.array);
      if (!arrayValidation.valid) {
        logSecurityEvent(
          req,
          'invalid_input_detected',
          'medium',
          {
            reason: 'Array length exceeded',
            path: req.path,
            message: arrayValidation.message
          }
        );
        
        return res.status(400).json({
          success: false,
          message: arrayValidation.message
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Request size validation error:', error);
    next(); // Continue on error to avoid breaking the app
  }
};

/**
 * Create custom request size validator
 */
const createRequestSizeValidator = (customLimits = {}) => {
  return (req, res, next) => {
    const limits = { ...DEFAULT_LIMITS, ...customLimits };
    const requestSize = calculateRequestSize(req);
    
    if (requestSize > limits.json) {
      return res.status(413).json({
        success: false,
        message: `Request size exceeds maximum allowed size of ${(limits.json / 1024).toFixed(2)}KB`
      });
    }
    
    if (req.body && typeof req.body === 'object') {
      const depth = calculateDepth(req.body);
      if (depth > limits.depth) {
        return res.status(400).json({
          success: false,
          message: `JSON depth exceeds maximum allowed depth of ${limits.depth}`
        });
      }
    }
    
    next();
  };
};

module.exports = {
  requestSizeValidation,
  createRequestSizeValidator,
  calculateRequestSize,
  calculateDepth,
  validateArrayLength,
  getEndpointLimits,
  DEFAULT_LIMITS,
  ENDPOINT_LIMITS
};

