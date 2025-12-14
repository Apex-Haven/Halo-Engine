# Security Documentation

This document outlines the security features, best practices, and incident response procedures for the HALO Backend API.

## Security Features

### 1. Authentication & Authorization

#### JWT Authentication
- **Token-based authentication** using JSON Web Tokens (JWT)
- **No default secrets**: Application requires `JWT_SECRET` environment variable (minimum 32 characters)
- **Token expiration**: Configurable via `JWT_EXPIRES_IN` (default: 24h)
- **Secure token generation**: Uses strong secrets validated on startup

#### Role-Based Access Control (RBAC)
- **Roles**: SUPER_ADMIN, ADMIN, VENDOR, CLIENT, DRIVER, TRAVELER
- **Permission-based authorization**: Fine-grained permissions for different operations
- **Resource-based authorization**: Users can only access resources they own or are assigned to

### 2. Input Validation & Sanitization

#### Input Sanitization
- **XSS Prevention**: All string inputs are sanitized to remove HTML/script tags
- **NoSQL Injection Prevention**: Dangerous MongoDB operators are filtered from requests
- **SQL Injection Prevention**: Input validation prevents injection attacks
- **Automatic sanitization**: Applied to all request bodies, query parameters, and URL parameters

#### Input Validation
- **Joi schemas**: Comprehensive validation for all API endpoints
- **Type checking**: Validates data types, formats, and constraints
- **Custom validators**: Role-specific and context-specific validation rules

### 3. Rate Limiting

#### Tiered Rate Limiting
- **General API**: 100 requests per 15 minutes (production), 1000 (development)
- **Authentication endpoints**: 5 requests per 15 minutes
- **Registration**: 3 requests per hour
- **Password reset**: 3 requests per hour
- **Sensitive operations**: 10 requests per 15 minutes
- **Per-user limiting**: Stricter limits for authenticated users

#### IP Whitelisting
- **Trusted IPs**: Configurable via `TRUSTED_IPS` environment variable
- **Whitelist bypass**: Trusted IPs can bypass rate limiting

### 4. Brute Force Protection

#### Progressive Delays
- **Exponential backoff**: Delays increase with each failed attempt
- **Base delay**: 1 second, maximum 30 seconds
- **Automatic blocking**: IP blocked after 5 failed attempts for 2 hours

#### Account Lockout
- **Failed login attempts**: Tracked per user account
- **Automatic lockout**: Account locked after 5 failed attempts for 2 hours
- **Integration**: Works with brute force protection for comprehensive security

### 5. HTTPS Enforcement

#### Production Security
- **HTTPS redirect**: All HTTP requests redirected to HTTPS in production
- **HSTS headers**: Strict Transport Security with 1-year max age
- **Certificate validation**: SSL/TLS certificate validation

### 6. Security Headers

#### Helmet Configuration
- **Content Security Policy (CSP)**: Restricts resource loading
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Referrer-Policy**: Controls referrer information
- **HSTS**: HTTP Strict Transport Security

### 7. Data Protection

#### Secure Logging
- **Data masking**: Passwords, tokens, API keys masked in logs
- **PII protection**: Email addresses and phone numbers masked in responses
- **Sensitive field filtering**: Automatic detection and masking of sensitive fields

#### Request Size Limits
- **Per-endpoint limits**: Different size limits for different endpoints
- **JSON depth limits**: Prevents deeply nested JSON attacks
- **Array length limits**: Prevents array-based DoS attacks

### 8. Security Audit Logging

#### Event Tracking
- **Authentication events**: Login success/failure, token generation/refresh
- **Authorization events**: Permission denials, unauthorized access attempts
- **Security events**: Brute force attempts, rate limit exceeded, suspicious activity
- **Data access events**: Sensitive data access, bulk exports
- **System events**: Configuration changes, security policy updates

#### Audit Log Features
- **Comprehensive metadata**: IP address, user agent, user ID, timestamps
- **Severity levels**: Low, medium, high, critical
- **Status tracking**: Success, failure, blocked, warning
- **Retention**: Configurable retention period (default: 90 days)

### 9. Error Handling

#### Secure Error Messages
- **No stack traces in production**: Stack traces only shown in development
- **Generic error messages**: Prevents information leakage
- **Proper HTTP status codes**: Accurate status codes for different error types

## Best Practices

### Environment Variables

1. **Never commit secrets**: Use `.env` file (not in version control)
2. **Strong secrets**: Use at least 32-character random strings for `JWT_SECRET`
3. **Different secrets**: Use different secrets for JWT and refresh tokens
4. **Regular rotation**: Rotate secrets periodically (recommended: every 90 days)

### Password Security

1. **Strong passwords**: Minimum 6 characters (enforced by schema)
2. **Hashing**: Passwords hashed using bcrypt with 12 salt rounds
3. **Never log passwords**: Passwords are never logged or returned in responses
4. **Password reset**: Secure password reset flow with rate limiting

### API Security

1. **Use HTTPS**: Always use HTTPS in production
2. **Validate inputs**: Always validate and sanitize all inputs
3. **Rate limiting**: Respect rate limits and implement client-side retry logic
4. **Error handling**: Handle errors gracefully without exposing sensitive information

### Database Security

1. **Connection security**: Use MongoDB connection strings with authentication
2. **Network isolation**: Restrict database access to application servers only
3. **Regular backups**: Maintain regular backups with encryption
4. **Access control**: Use MongoDB roles and permissions

### Monitoring & Alerting

1. **Monitor audit logs**: Regularly review security audit logs
2. **Set up alerts**: Configure alerts for high-severity security events
3. **Track anomalies**: Monitor for unusual access patterns
4. **Incident response**: Have a plan for responding to security incidents

## Incident Response

### Security Incident Types

1. **Unauthorized access**: Unauthorized user accessing the system
2. **Data breach**: Unauthorized access to sensitive data
3. **DDoS attack**: Distributed denial of service attack
4. **Malicious code**: Injection of malicious code or scripts
5. **Account compromise**: User account credentials compromised

### Response Procedures

1. **Immediate actions**:
   - Identify and isolate affected systems
   - Revoke compromised credentials
   - Block malicious IP addresses
   - Enable additional logging

2. **Investigation**:
   - Review security audit logs
   - Identify attack vectors
   - Assess data exposure
   - Document findings

3. **Remediation**:
   - Patch vulnerabilities
   - Update security configurations
   - Reset compromised credentials
   - Notify affected users (if required)

4. **Post-incident**:
   - Review and update security policies
   - Conduct security audit
   - Update documentation
   - Train staff on lessons learned

## Security Configuration

### Environment Variables

See `env.example` for all available security-related environment variables.

### Key Security Settings

```env
# Required
JWT_SECRET=<strong-random-secret-min-32-chars>

# Recommended
JWT_REFRESH_SECRET=<different-strong-secret>
ENABLE_BRUTE_FORCE_PROTECTION=true
LOG_SECURITY_EVENTS=true
NODE_ENV=production

# Optional
TRUSTED_IPS=127.0.0.1,::1
AUTH_RATE_LIMIT_MAX=5
RATE_LIMIT_MAX_REQUESTS=100
```

## Security Testing

### Recommended Tests

1. **Authentication tests**: Test login, logout, token validation
2. **Authorization tests**: Test role-based and resource-based access control
3. **Input validation tests**: Test XSS, SQL injection, NoSQL injection prevention
4. **Rate limiting tests**: Test rate limit enforcement
5. **Brute force tests**: Test brute force protection
6. **Security header tests**: Verify security headers are present

### Tools

- **OWASP ZAP**: Web application security scanner
- **Burp Suite**: Web vulnerability scanner
- **Postman**: API testing and security testing
- **npm audit**: Dependency vulnerability scanning

## Compliance

### Data Protection

- **PII handling**: Personal identifiable information is masked in logs
- **Data retention**: Audit logs retained for 90 days (configurable)
- **Access control**: Strict access control for sensitive data

### Security Standards

- **OWASP Top 10**: Protection against common web vulnerabilities
- **CWE Top 25**: Protection against common software weaknesses
- **Best practices**: Following industry best practices for API security

## Security Contacts

For security concerns or to report vulnerabilities:

1. **Email**: security@halo.com (replace with actual contact)
2. **Response time**: Within 24 hours for critical issues
3. **Disclosure policy**: Responsible disclosure preferred

## Updates

This document is updated as security features are added or modified. Last updated: 2025-01-17

## References

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

