/**
 * Secure Logging Middleware
 * Masks sensitive data (passwords, tokens, PII) in logs
 */

/**
 * Fields that should be masked in logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'authorization',
  'auth',
  'jwt',
  'session',
  'cookie',
  'creditCard',
  'credit_card',
  'cvv',
  'ssn',
  'socialSecurityNumber',
  'phone',
  'phoneNumber',
  'mobile',
  'email', // Can be configured to mask or not
  'address',
  'zipCode',
  'postalCode'
];

/**
 * Mask a value (shows only first and last characters)
 */
const maskValue = (value, visibleChars = 2) => {
  if (!value || typeof value !== 'string') {
    return '***';
  }

  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }

  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  const masked = '*'.repeat(Math.max(4, value.length - visibleChars * 2));
  
  return `${start}${masked}${end}`;
};

/**
 * Recursively mask sensitive fields in an object
 * Handles circular references and Mongoose documents
 */
const maskSensitiveData = (obj, maskEmail = true, visited = new WeakSet(), depth = 0) => {
  // Prevent infinite recursion
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    return '[Max depth reached]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle circular references
  if (typeof obj === 'object') {
    if (visited.has(obj)) {
      return '[Circular Reference]';
    }
    visited.add(obj);
  }

  // Convert Mongoose documents to plain objects
  if (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'model') {
    try {
      obj = obj.toObject ? obj.toObject() : obj;
    } catch (e) {
      // If toObject fails, try to get plain object
      obj = JSON.parse(JSON.stringify(obj));
    }
  }

  // Handle Mongoose documents (check for _doc property)
  if (obj && typeof obj === 'object' && obj._doc) {
    obj = obj._doc;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, maskEmail, visited, depth + 1));
  }

  if (typeof obj === 'object') {
    // Skip certain object types that cause issues
    if (obj instanceof Date) {
      return obj;
    }
    if (obj instanceof RegExp) {
      return obj.toString();
    }
    if (Buffer.isBuffer(obj)) {
      return '[Buffer]';
    }
    if (obj.constructor && obj.constructor.name === 'ObjectId') {
      return obj.toString();
    }

    const masked = {};
    
    for (const key in obj) {
      // Skip internal Mongoose properties
      if (key === '__v' || key === '_id' || key === 'id' || key.startsWith('$')) {
        continue;
      }

      try {
        if (obj.hasOwnProperty(key)) {
          const lowerKey = key.toLowerCase();
          
          // Check if this field should be masked
          const shouldMask = SENSITIVE_FIELDS.some(field => 
            lowerKey.includes(field.toLowerCase())
          ) || (maskEmail && lowerKey === 'email');

          if (shouldMask) {
            masked[key] = maskValue(String(obj[key]));
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            // Recursively mask nested objects
            masked[key] = maskSensitiveData(obj[key], maskEmail, visited, depth + 1);
          } else {
            masked[key] = obj[key];
          }
        }
      } catch (e) {
        // Skip properties that cause errors (likely circular refs)
        masked[key] = '[Error processing]';
      }
    }
    
    return masked;
  }

  return obj;
};

/**
 * Mask sensitive data in request body
 */
const maskRequestBody = (req) => {
  if (req.body && typeof req.body === 'object') {
    return maskSensitiveData(req.body, false); // Don't mask email in request body for debugging
  }
  return req.body;
};

/**
 * Mask sensitive data in response body
 */
const maskResponseBody = (res) => {
  if (!res || !res.body) {
    return res;
  }

  // If res.body is already the body (not wrapped), use it directly
  const body = res.body;
  
  if (typeof body === 'object') {
    // Convert Mongoose documents to plain objects first
    let plainBody = body;
    try {
      // If it's a Mongoose document, convert to plain object
      if (body && typeof body === 'object' && body.toObject) {
        plainBody = body.toObject();
      } else if (body && typeof body === 'object' && body.constructor && body.constructor.name === 'model') {
        plainBody = body.toObject ? body.toObject() : JSON.parse(JSON.stringify(body));
      }
    } catch (e) {
      // If conversion fails, try JSON stringify/parse (this will remove circular refs)
      try {
        plainBody = JSON.parse(JSON.stringify(body));
      } catch (e2) {
        // If that also fails, just return a safe representation
        return { error: 'Unable to serialize response body' };
      }
    }
    
    return maskSensitiveData(plainBody, true); // Mask email in responses
  }
  
  return body;
};

/**
 * Mask Authorization header
 */
const maskHeaders = (headers) => {
  const masked = { ...headers };
  
  if (masked.authorization) {
    const authValue = masked.authorization;
    if (authValue.startsWith('Bearer ')) {
      masked.authorization = `Bearer ${maskValue(authValue.substring(7))}`;
    } else {
      masked.authorization = maskValue(authValue);
    }
  }
  
  if (masked.cookie) {
    masked.cookie = maskValue(masked.cookie);
  }
  
  return masked;
};

/**
 * Secure logging middleware
 * Intercepts and masks sensitive data before logging
 */
const secureLogging = (req, res, next) => {
  // Store original methods
  const originalSend = res.send;
  const originalJson = res.json;

  // Override res.send to mask response
  res.send = function(body) {
    if (process.env.LOG_SECURITY_EVENTS !== 'false') {
      const maskedBody = typeof body === 'string' 
        ? body 
        : maskResponseBody({ body });
      
      // Log with masked data
      if (process.env.NODE_ENV === 'development') {
        console.log('Response:', JSON.stringify(maskedBody, null, 2));
      }
    }
    
    return originalSend.call(this, body);
  };

  // Override res.json to mask response
  res.json = function(body) {
    if (process.env.LOG_SECURITY_EVENTS !== 'false') {
      try {
        // Convert Mongoose documents to plain objects first
        let plainBody = body;
        if (body && typeof body === 'object') {
          if (body.toObject && typeof body.toObject === 'function') {
            try {
              plainBody = body.toObject();
            } catch (e) {
              // If toObject fails, try JSON stringify/parse
              plainBody = JSON.parse(JSON.stringify(body));
            }
          } else if (body.constructor && body.constructor.name === 'model') {
            try {
              plainBody = body.toObject ? body.toObject() : JSON.parse(JSON.stringify(body));
            } catch (e) {
              plainBody = JSON.parse(JSON.stringify(body));
            }
          }
        }
        
        const maskedBody = maskSensitiveData(plainBody, true);
        
        // Log with masked data
        if (process.env.NODE_ENV === 'development') {
          console.log('Response:', JSON.stringify(maskedBody, null, 2));
        }
      } catch (error) {
        // If masking fails, just log a safe message
        if (process.env.NODE_ENV === 'development') {
          console.log('Response: [Unable to mask response body]', error.message);
        }
      }
    }
    
    return originalJson.call(this, body);
  };

  // Log request with masked data
  if (process.env.LOG_SECURITY_EVENTS !== 'false') {
    const maskedBody = maskRequestBody(req);
    const maskedHeaders = maskHeaders(req.headers);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Request:', {
        method: req.method,
        url: req.url,
        headers: maskedHeaders,
        body: maskedBody,
        query: req.query,
        params: req.params
      });
    }
  }

  next();
};

/**
 * Create a secure logger function
 */
const createSecureLogger = (maskEmail = true) => {
  return (data) => {
    const masked = maskSensitiveData(data, maskEmail);
    return JSON.stringify(masked, null, 2);
  };
};

module.exports = {
  secureLogging,
  maskSensitiveData,
  maskValue,
  maskRequestBody,
  maskResponseBody,
  maskHeaders,
  createSecureLogger
};

