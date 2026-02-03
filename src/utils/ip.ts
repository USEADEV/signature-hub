import { Request } from 'express';

/**
 * Get the real client IP address from the request.
 *
 * Priority:
 * 1. CF-Connecting-IP (Cloudflare's verified client IP when proxying)
 * 2. X-Forwarded-For first entry (standard proxy header)
 * 3. req.ip (Express parsed IP with trust proxy)
 * 4. Socket remote address (direct connection)
 */
export function getClientIp(req: Request): string {
  // Cloudflare sets this header with the original client IP
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp && typeof cfConnectingIp === 'string') {
    return cfConnectingIp.trim();
  }

  // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
  // The first one is typically the original client
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0])
      .split(',')
      .map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Express parsed IP (respects trust proxy setting)
  if (req.ip) {
    return req.ip;
  }

  // Direct socket connection
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Get country code from Cloudflare headers (when proxying is enabled)
 */
export function getClientCountry(req: Request): string | undefined {
  const cfIpCountry = req.headers['cf-ipcountry'];
  if (cfIpCountry && typeof cfIpCountry === 'string') {
    return cfIpCountry.toUpperCase();
  }
  return undefined;
}
