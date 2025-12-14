/**
 * HTTPS Enforcement Middleware
 * Enforces HTTPS in production and handles secure connections
 */

/**
 * Middleware to enforce HTTPS in production
 * Redirects HTTP requests to HTTPS
 */
const enforceHTTPS = (req, res, next) => {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Check if request is secure
  // X-Forwarded-Proto is set by proxies/load balancers (Heroku, AWS, etc.)
  const isSecure = req.secure || 
                   req.headers['x-forwarded-proto'] === 'https' ||
                   req.headers['x-forwarded-ssl'] === 'on';

  if (!isSecure) {
    // Redirect to HTTPS
    const httpsUrl = `https://${req.headers.host}${req.originalUrl}`;
    return res.redirect(301, httpsUrl);
  }

  next();
};

/**
 * Middleware to validate SSL certificate (if needed)
 * This is typically handled by the reverse proxy/load balancer
 */
const validateSSL = (req, res, next) => {
  // In production, ensure we're using HTTPS
  if (process.env.NODE_ENV === 'production') {
    const isSecure = req.secure || 
                     req.headers['x-forwarded-proto'] === 'https';
    
    if (!isSecure) {
      return res.status(403).json({
        success: false,
        message: 'HTTPS required. Please use a secure connection.'
      });
    }
  }

  next();
};

/**
 * Get secure headers for HTTPS enforcement
 */
const getSecureHeaders = () => {
  const headers = {};

  if (process.env.NODE_ENV === 'production') {
    // Strict Transport Security (HSTS) - handled by Helmet
    // Additional security headers can be added here
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['X-Frame-Options'] = 'DENY';
    headers['X-XSS-Protection'] = '1; mode=block';
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  }

  return headers;
};

module.exports = {
  enforceHTTPS,
  validateSSL,
  getSecureHeaders
};

