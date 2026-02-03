import rateLimit from 'express-rate-limit';

export const verificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  message: { error: 'Too many verification requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const signatureRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 signature submissions per hour per IP
  message: { error: 'Too many signature submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many API requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 admin requests per 15 minutes
  message: { error: 'Too many admin requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
