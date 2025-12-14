const axios = require('axios');

/**
 * CozyCozy Authentication Service
 * Handles authentication with CozyCozy API
 * Supports session-based authentication and token management
 */
class CozyCozyAuthService {
  constructor() {
    this.baseUrl = process.env.COZYCOZY_API_URL || 'https://www.cozycozy.com/api';
    this.authToken = process.env.COZYCOZY_AUTH_TOKEN || null;
    this.tokenExpiry = null;
    this.loginUrl = 'https://login.cozycozy.com';
  }

  /**
   * Get current authentication token
   * @returns {string|null} Auth token or null
   */
  getToken() {
    return this.authToken;
  }

  /**
   * Check if token is valid
   * @returns {boolean} True if token exists and not expired
   */
  isTokenValid() {
    if (!this.authToken) return false;
    if (this.tokenExpiry && Date.now() > this.tokenExpiry) {
      return false;
    }
    return true;
  }

  /**
   * Set authentication token
   * @param {string} token - Bearer token
   * @param {number} expiresIn - Expiration time in seconds
   */
  setToken(token, expiresIn = null) {
    this.authToken = token;
    if (expiresIn) {
      this.tokenExpiry = Date.now() + (expiresIn * 1000);
    }
  }

  /**
   * Extract token from JWT (if needed for validation)
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded token payload
   */
  decodeToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8')
      );
      
      return payload;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  /**
   * Check if token is expired based on JWT payload
   * @param {string} token - JWT token
   * @returns {boolean} True if expired
   */
  isTokenExpired(token) {
    const payload = this.decodeToken(token);
    if (!payload || !payload.exp) return false;
    
    const expiryTime = payload.exp * 1000; // Convert to milliseconds
    return Date.now() > expiryTime;
  }

  /**
   * Refresh authentication token (if refresh mechanism available)
   * Note: CozyCozy may require re-login for new tokens
   * @returns {Promise<string|null>} New token or null
   */
  async refreshToken() {
    // CozyCozy doesn't seem to have a refresh endpoint
    // This would require re-authentication
    console.warn('CozyCozy token refresh not available. Please re-authenticate.');
    return null;
  }

  /**
   * Validate token by making a test API call
   * @returns {Promise<boolean>} True if token is valid
   */
  async validateToken() {
    if (!this.authToken) return false;

    try {
      // Make a minimal API call to validate token
      const response = await axios.get(
        `${this.baseUrl}/validate`,
        {
          headers: {
            'authorization': `Bearer ${this.authToken}`,
            'accept': 'application/json'
          },
          timeout: 5000,
          validateStatus: (status) => status < 500 // Don't throw on 401/403
        }
      );

      return response.status === 200;
    } catch (error) {
      // If validation endpoint doesn't exist, check token expiry
      if (error.response?.status === 404) {
        return !this.isTokenExpired(this.authToken);
      }
      return false;
    }
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers with authorization
   */
  getAuthHeaders() {
    if (!this.authToken) {
      return {};
    }

    return {
      'authorization': `Bearer ${this.authToken}`
    };
  }
}

module.exports = new CozyCozyAuthService();

