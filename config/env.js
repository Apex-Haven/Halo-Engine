/**
 * Environment Variable Validation
 * Validates all required environment variables on startup
 */

const requiredEnvVars = {
  // Critical - Application will not start without these
  critical: [
    'JWT_SECRET'
  ],
  
  // Important - Application will warn but continue
  important: [
    'MONGODB_URI',
    'NODE_ENV'
  ],
  
  // Optional - Application will use defaults
  optional: [
    'PORT',
    'JWT_EXPIRES_IN',
    'ALLOWED_ORIGINS',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'EMAIL_USER',
    'EMAIL_PASS',
    'AVIATIONSTACK_API_KEY',
    'COZYCOZY_API_URL',
    'COZYCOZY_AUTH_TOKEN',
    'COZYCOZY_RATE_LIMIT_MS',
    'OLLAMA_BASE_URL',
    'USE_ML_MATCHING'
  ]
};

/**
 * Validates JWT_SECRET strength
 */
const validateJWTSecret = (secret) => {
  if (!secret) {
    throw new Error('JWT_SECRET is required but not set');
  }
  
  if (secret.length < 32) {
    throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
  }
  
  // Check for common weak secrets
  const weakSecrets = [
    'halo_secret_key',
    'secret',
    'password',
    '123456',
    'admin',
    'test'
  ];
  
  if (weakSecrets.some(weak => secret.toLowerCase().includes(weak))) {
    console.warn('⚠️  WARNING: JWT_SECRET appears to be weak. Please use a strong, random secret.');
  }
  
  // Check entropy (basic check)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 10) {
    console.warn('⚠️  WARNING: JWT_SECRET has low character diversity. Consider using a more random secret.');
  }
  
  return true;
};

/**
 * Validates MongoDB URI format
 */
const validateMongoDBURI = (uri) => {
  if (!uri) return false;
  
  // Basic format check
  const mongoPattern = /^mongodb(\+srv)?:\/\//;
  return mongoPattern.test(uri);
};

/**
 * Validates NODE_ENV value
 */
const validateNodeEnv = (env) => {
  const validEnvs = ['development', 'production', 'test', 'staging'];
  return !env || validEnvs.includes(env);
};

/**
 * Main validation function
 */
const validateEnv = () => {
  const errors = [];
  const warnings = [];
  
  // Validate critical variables
  for (const varName of requiredEnvVars.critical) {
    const value = process.env[varName];
    
    if (!value) {
      errors.push(`❌ ${varName} is required but not set`);
    } else {
      // Special validation for JWT_SECRET
      if (varName === 'JWT_SECRET') {
        try {
          validateJWTSecret(value);
        } catch (error) {
          errors.push(`❌ ${varName}: ${error.message}`);
        }
      }
    }
  }
  
  // Validate important variables
  for (const varName of requiredEnvVars.important) {
    const value = process.env[varName];
    
    if (!value) {
      warnings.push(`⚠️  ${varName} is not set (using fallback or mock data)`);
    } else {
      // Special validation
      if (varName === 'MONGODB_URI') {
        if (!validateMongoDBURI(value)) {
          warnings.push(`⚠️  ${varName} format appears invalid`);
        }
      } else if (varName === 'NODE_ENV') {
        if (!validateNodeEnv(value)) {
          warnings.push(`⚠️  ${varName} should be one of: development, production, test, staging`);
        }
      }
    }
  }
  
  // Display warnings
  if (warnings.length > 0) {
    console.log('\n📋 Environment Variable Warnings:');
    warnings.forEach(warning => console.log(`  ${warning}`));
  }
  
  // Display errors and exit if critical
  if (errors.length > 0) {
    console.error('\n❌ Critical Environment Variable Errors:');
    errors.forEach(error => console.error(`  ${error}`));
    console.error('\n💡 Please set the required environment variables in your .env file');
    console.error('💡 See env.example for reference\n');
    process.exit(1);
  }
  
  // Success message
  if (process.env.NODE_ENV === 'production') {
    console.log('✅ Environment variables validated successfully');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Get JWT secret with validation
 */
const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is required but not set. Please set it in your .env file.');
  }
  
  if (secret.length < 32) {
    throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${secret.length}`);
  }
  
  return secret;
};

/**
 * Get JWT refresh secret (optional, falls back to JWT_SECRET)
 */
const getJWTRefreshSecret = () => {
  return process.env.JWT_REFRESH_SECRET || getJWTSecret();
};

module.exports = {
  validateEnv,
  getJWTSecret,
  getJWTRefreshSecret,
  validateJWTSecret
};

