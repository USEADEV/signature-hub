import dotenv from 'dotenv';

dotenv.config();

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  env: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  baseUrl: optionalEnv('BASE_URL', 'http://localhost:3000'),

  // Demo mode: skips real email/SMS, uses code "123456"
  demoMode: optionalEnv('DEMO_MODE', 'true') === 'true',

  // Database type: 'sqlite' or 'mysql'
  dbType: optionalEnv('DB_TYPE', 'sqlite') as 'sqlite' | 'mysql',

  db: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: parseInt(optionalEnv('DB_PORT', '3306'), 10),
    user: optionalEnv('DB_USER', 'root'),
    password: optionalEnv('DB_PASSWORD', ''),
    database: optionalEnv('DB_NAME', 'showconnect'),
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },

  mandrill: {
    apiKey: process.env.MANDRILL_API_KEY || '',
    phoneNumber: process.env.MANDRILL_PHONE_NUMBER || '',
  },

  // SMS provider: 'twilio' or 'mandrill'
  smsProvider: (process.env.SMS_PROVIDER || 'mandrill') as 'twilio' | 'mandrill',

  email: {
    host: optionalEnv('SMTP_HOST', 'smtp.example.com'),
    port: parseInt(optionalEnv('SMTP_PORT', '587'), 10),
    secure: optionalEnv('SMTP_SECURE', 'false') === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: optionalEnv('EMAIL_FROM', 'signatures@example.com'),
  },

  apiKey: process.env.API_KEY || 'demo-api-key',

  verification: {
    codeLength: 6,
    codeExpiryMinutes: 5,
    maxAttempts: 3,
    demoCode: '123456', // Fixed code for demo mode
  },

  request: {
    defaultExpiryDays: 7,
  },
};

export function validateConfig(): void {
  // In demo mode, skip validation
  if (config.demoMode) {
    console.log('Running in DEMO MODE - email/SMS verification disabled');
    return;
  }

  const errors: string[] = [];

  if (config.env === 'production' && !config.demoMode) {
    if (!config.twilio.accountSid) {
      errors.push('TWILIO_ACCOUNT_SID is required in production');
    }
    if (!config.email.user) {
      errors.push('SMTP_USER is required in production');
    }
    if (config.apiKey === 'demo-api-key') {
      errors.push('API_KEY must be set to a secure value in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
