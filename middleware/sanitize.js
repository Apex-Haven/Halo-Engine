/**
 * Input Sanitization Middleware
 * Prevents XSS, NoSQL injection, and other injection attacks
 */

const xss = require('xss');

/**
 * Dangerous MongoDB operators that should be filtered
 */
const DANGEROUS_OPERATORS = [
  '$where',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$exists',
  '$regex',
  '$text',
  '$mod',
  '$all',
  '$elemMatch',
  '$size',
  '$type',
  '$not',
  '$or',
  '$and',
  '$nor',
  '$expr',
  '$jsonSchema',
  '$geoWithin',
  '$geoIntersects',
  '$near',
  '$nearSphere',
  '$geometry',
  '$maxDistance',
  '$minDistance',
  '$center',
  '$centerSphere',
  '$box',
  '$polygon',
  '$comment',
  '$slice',
  '$natural'
];

/**
 * Recursively sanitize object to remove dangerous MongoDB operators
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Check if key starts with $ (MongoDB operator)
        if (key.startsWith('$')) {
          // Allow only safe operators in specific contexts
          const safeOperators = ['$set', '$unset', '$inc', '$push', '$pull', '$addToSet'];
          if (!safeOperators.includes(key) && DANGEROUS_OPERATORS.includes(key)) {
            console.warn(`⚠️  Blocked dangerous MongoDB operator: ${key}`);
            continue; // Skip this key
          }
        }
        
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    
    return sanitized;
  }

  // Sanitize strings to prevent XSS
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  return obj;
};

/**
 * Sanitize string to prevent XSS attacks
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') {
    return str;
  }

  // Remove null bytes
  str = str.replace(/\0/g, '');
  
  // Use xss library for HTML/script tag removal
  str = xss(str, {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  });

  return str;
};

/**
 * Sanitize request body
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Sanitize request query parameters
 */
const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};

/**
 * Sanitize request parameters
 */
const sanitizeParams = (req, res, next) => {
  if (req.params && typeof req.params === 'object') {
    // Sanitize param values (keys are usually safe)
    for (const key in req.params) {
      if (req.params.hasOwnProperty(key) && typeof req.params[key] === 'string') {
        req.params[key] = sanitizeString(req.params[key]);
      }
    }
  }
  next();
};

/**
 * Comprehensive sanitization middleware
 * Applies all sanitization functions
 */
const sanitize = (req, res, next) => {
  sanitizeBody(req, res, () => {
    sanitizeQuery(req, res, () => {
      sanitizeParams(req, res, next);
    });
  });
};

/**
 * Sanitize specific field in request
 */
const sanitizeField = (fieldName) => {
  return (req, res, next) => {
    if (req.body && req.body[fieldName]) {
      if (typeof req.body[fieldName] === 'string') {
        req.body[fieldName] = sanitizeString(req.body[fieldName]);
      } else if (typeof req.body[fieldName] === 'object') {
        req.body[fieldName] = sanitizeObject(req.body[fieldName]);
      }
    }
    next();
  };
};

module.exports = {
  sanitize,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeField,
  sanitizeString,
  sanitizeObject
};

