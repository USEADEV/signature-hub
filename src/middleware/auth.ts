import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  if (apiKey !== config.apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
