import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../utils/ip';

// Use Cloudflare-aware IP extraction for all rate limiters
const keyGenerator = (req: Request): string => getClientIp(req);

export const verificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  message: { error: 'Too many verification requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

export const signatureRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 signature submissions per hour per IP
  message: { error: 'Too many signature submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many API requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 admin requests per 15 minutes
  message: { error: 'Too many admin requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

// Per-destination rate limiting for verification code sends
// Prevents email/SMS flooding even with IP rotation
interface DestinationLimit {
  count: number;
  resetAt: number;
}

const destinationLimits = new Map<string, DestinationLimit>();
const DESTINATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DESTINATION_MAX_REQUESTS = 5; // Max 5 verification codes per hour to same email/phone

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of destinationLimits.entries()) {
    if (value.resetAt <= now) {
      destinationLimits.delete(key);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

/**
 * Check if a destination (email or phone) has exceeded rate limits
 * Returns true if allowed, false if rate limited
 */
export function checkDestinationLimit(destination: string): boolean {
  const key = destination.toLowerCase();
  const now = Date.now();

  const existing = destinationLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    // First request or window expired - allow and start new window
    destinationLimits.set(key, {
      count: 1,
      resetAt: now + DESTINATION_WINDOW_MS,
    });
    return true;
  }

  if (existing.count >= DESTINATION_MAX_REQUESTS) {
    // Rate limited
    return false;
  }

  // Increment count and allow
  existing.count++;
  return true;
}

// Per-token rate limiting for verification requests
// Limits how many times codes can be requested for a single signing token
interface TokenLimit {
  count: number;
}

const tokenLimits = new Map<string, TokenLimit>();
const TOKEN_MAX_REQUESTS = 10; // Max 10 verification code requests per token lifetime

/**
 * Check if a token has exceeded lifetime verification request limits
 * Returns true if allowed, false if rate limited
 */
export function checkTokenVerificationLimit(tokenId: string): boolean {
  const existing = tokenLimits.get(tokenId);

  if (!existing) {
    // First request for this token
    tokenLimits.set(tokenId, { count: 1 });
    return true;
  }

  if (existing.count >= TOKEN_MAX_REQUESTS) {
    // Rate limited
    return false;
  }

  // Increment count and allow
  existing.count++;
  return true;
}
