const Joi = require('joi');
const crypto = require('crypto');

// Environment variable schema with comprehensive validation
const envSchema = Joi.object({
    // Database Configuration
    DB_HOST: Joi.string().default('localhost'),
    DB_USER: Joi.string().default('portfolio'),
    DB_PASSWORD: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(32).required().messages({
            'string.min': 'DB_PASSWORD must be at least 32 characters in production',
            'any.required': 'DB_PASSWORD is required in production'
        }),
        otherwise: Joi.string().min(16).optional().messages({
            'string.min': 'DB_PASSWORD must be at least 16 characters in development'
        })
    }),
    DB_NAME: Joi.string().default('portfolio'),
    DB_ROOT_PASSWORD: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(32).required().messages({
            'string.min': 'DB_ROOT_PASSWORD must be at least 32 characters in production',
            'any.required': 'DB_ROOT_PASSWORD is required in production'
        }),
        otherwise: Joi.string().min(16).optional().messages({
            'string.min': 'DB_ROOT_PASSWORD must be at least 16 characters in development'
        })
    }),
    // Add database type indicator
    DB_TYPE: Joi.string().valid('mysql', 'json').default('json'),

    // JWT Configuration
    JWT_SECRET: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(64).required().messages({
            'string.min': 'JWT_SECRET must be at least 64 characters in production',
            'any.required': 'JWT_SECRET is required in production'
        }),
        otherwise: Joi.string().min(16).default(crypto.randomBytes(16).toString('hex'))
    }),

    // Application Configuration
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number().default(3000).min(1).max(65535),

    // GitHub Configuration
    GITHUB_USERNAME: Joi.string().default('shilohrobinson'),
    GITHUB_TOKEN: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().pattern(/^ghp_[a-zA-Z0-9]{36}$/).messages({
            'string.pattern.base': 'GITHUB_TOKEN must be a valid GitHub personal access token'
        }),
        otherwise: Joi.string().allow('').default('your-github-personal-access-token')
    }),

    // Email Configuration
    SMTP_HOST: Joi.string().default('smtp.gmail.com'),
    SMTP_PORT: Joi.number().default(587).min(1).max(65535),
    SMTP_USER: Joi.string().email().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().required().messages({
            'any.required': 'SMTP_USER is required in production'
        }),
        otherwise: Joi.string().default('your-email@gmail.com')
    }),
    SMTP_PASS: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(16).required().messages({
            'string.min': 'SMTP_PASS must be at least 16 characters in production',
            'any.required': 'SMTP_PASS is required in production'
        }),
        otherwise: Joi.string().default('your-app-password')
    }),

    // Security Configuration
    CORS_ORIGIN: Joi.string().when('NODE_ENV', {
        is: 'production',
        then: Joi.string().uri().default('https://shilohrobinson.dev'),
        otherwise: Joi.string().default('http://localhost:8080')
    }),

    // Logging Configuration
    LOG_LEVEL: Joi.string()
        .valid('error', 'warn', 'info', 'debug')
        .default('info'),
    LOG_FILE_ENABLED: Joi.boolean().default(true),

    // Rate Limiting Configuration
    RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: Joi.number().when('NODE_ENV', {
        is: 'production',
        then: Joi.number().default(50),
        otherwise: Joi.number().default(200)
    }),
    AUTH_RATE_LIMIT_MAX: Joi.number().when('NODE_ENV', {
        is: 'production',
        then: Joi.number().default(5),
        otherwise: Joi.number().default(20)
    })
}).unknown(true); // Allow unknown variables for flexibility

// Weak pattern detection for security
const weakPatterns = [
    'your-secret-key',
    'change-in-production',
    'securepassword',
    'password',
    'secret',
    'your-super-secret',
    'your-github',
    'your-email',
    'your-app-password',
    'test',
    'demo',
    'example',
    'default',
    '123456',
    'qwerty'
];

function detectWeakValues(value, varName) {
    if (!value || typeof value !== 'string') return false;
    
    const lowerValue = value.toLowerCase();
    
    // Check for weak patterns
    if (weakPatterns.some(pattern => lowerValue.includes(pattern))) {
        return true;
    }
    
    // Check for common weak passwords
    if (varName.includes('PASSWORD') && value.length < 16) {
        return true;
    }
    
    // Check for insufficient entropy in secrets
    if (varName.includes('SECRET') && value.length < 32) {
        return true;
    }
    
    return false;
}

// Validate and load configuration
function validateConfig() {
    const { error, value: envVars } = envSchema.validate(process.env, {
        stripUnknown: false,
        allowUnknown: true,
        convert: true
    });

    if (error) {
        const errorMessage = `Environment validation failed:\n${error.details
            .map(detail => `  - ${detail.path.join('.')}: ${detail.message}`)
            .join('\n')}`;
        throw new Error(errorMessage);
    }

    // Validate required environment variables are present
    // Only require DB credentials if using MySQL
    const isJsonDb = envVars.DB_TYPE === 'json';
    const requiredVars = isJsonDb 
        ? ['JWT_SECRET'] 
        : ['DB_PASSWORD', 'JWT_SECRET', 'DB_ROOT_PASSWORD'];
    const missingVars = requiredVars.filter(varName => !envVars[varName] || envVars[varName].trim() === '');
    
    if (missingVars.length > 0) {
        throw new Error(`Required environment variables are missing or empty: ${missingVars.join(', ')}`);
    }

    // Additional security checks for production
    if (envVars.NODE_ENV === 'production') {
        const securityChecks = [
            { var: 'JWT_SECRET', value: envVars.JWT_SECRET }
        ];
        
        // Only check DB credentials if using MySQL
        if (envVars.DB_TYPE !== 'json') {
            securityChecks.push(
                { var: 'DB_PASSWORD', value: envVars.DB_PASSWORD },
                { var: 'DB_ROOT_PASSWORD', value: envVars.DB_ROOT_PASSWORD }
            );
        }

        for (const check of securityChecks) {
            if (detectWeakValues(check.value, check.var)) {
                throw new Error(
                    `${check.var} appears to be using a weak or default value. ` +
                    'Please use a cryptographically secure random string.'
                );
            }
        }

        // Validate GitHub token format
        if (envVars.GITHUB_TOKEN && envVars.GITHUB_TOKEN.includes('your-github')) {
            console.warn('⚠️  Warning: GITHUB_TOKEN appears to be using a default value');
        }

        // Validate email configuration
        if (envVars.SMTP_USER && envVars.SMTP_USER.includes('your-email')) {
            console.warn('⚠️  Warning: SMTP_USER appears to be using a default value');
        }

        if (envVars.SMTP_PASS && envVars.SMTP_PASS.includes('your-app-password')) {
            console.warn('⚠️  Warning: SMTP_PASS appears to be using a default value');
        }
    }

    // Log configuration status (without exposing secrets)
    const configStatus = {
        environment: envVars.NODE_ENV,
        port: envVars.PORT,
        database: {
            type: envVars.DB_TYPE,
            host: envVars.DB_HOST,
            user: envVars.DB_USER,
            name: envVars.DB_NAME,
            hasPassword: !!envVars.DB_PASSWORD,
            hasRootPassword: !!envVars.DB_ROOT_PASSWORD
        },
        security: {
            hasJwtSecret: !!envVars.JWT_SECRET,
            jwtSecretLength: envVars.JWT_SECRET ? envVars.JWT_SECRET.length : 0,
            corsOrigin: envVars.CORS_ORIGIN,
            rateLimiting: {
                windowMs: envVars.RATE_LIMIT_WINDOW_MS,
                maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
                authMaxRequests: envVars.AUTH_RATE_LIMIT_MAX
            }
        },
        features: {
            github: {
                username: envVars.GITHUB_USERNAME,
                hasToken: !!envVars.GITHUB_TOKEN && !envVars.GITHUB_TOKEN.includes('your-github')
            },
            email: {
                host: envVars.SMTP_HOST,
                port: envVars.SMTP_PORT,
                hasUser: !!envVars.SMTP_USER && !envVars.SMTP_USER.includes('your-email'),
                hasPassword: !!envVars.SMTP_PASS && !envVars.SMTP_PASS.includes('your-app-password')
            }
        },
        logging: {
            level: envVars.LOG_LEVEL,
            fileEnabled: envVars.LOG_FILE_ENABLED
        }
    };

    return {
        envVars,
        configStatus
    };
}

// Generate secure secrets for new deployments
function generateSecureSecrets() {
    return {
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        DB_PASSWORD: crypto.randomBytes(32).toString('hex'),
        DB_ROOT_PASSWORD: crypto.randomBytes(32).toString('hex'),
        SMTP_PASS: crypto.randomBytes(16).toString('hex')
    };
}

// Validate a specific environment variable
function validateVariable(varName, value, isProduction = false) {
    const schema = envSchema.extract(varName);
    if (!schema) {
        return { valid: true, error: null };
    }

    const { error } = schema.validate(value);
    if (error) {
        return { valid: false, error: error.details[0].message };
    }

    if (isProduction && detectWeakValues(value, varName)) {
        return {
            valid: false,
            error: `${varName} appears to be using a weak or default value`
        };
    }

    return { valid: true, error: null };
}

module.exports = {
    validateConfig,
    generateSecureSecrets,
    validateVariable,
    envSchema
};