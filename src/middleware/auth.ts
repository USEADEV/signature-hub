import { Request, Response, NextFunction } from 'express';
import { getSqliteDb } from '../db/sqlite';

interface ApiKeyRow {
  id: string;
  api_key: string;
  tenant_id: string;
  tenant_name: string;
  is_active: number;
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const db = getSqliteDb();
  const row = db.prepare(
    'SELECT * FROM api_keys WHERE api_key = ? AND is_active = 1'
  ).get(apiKey) as ApiKeyRow | undefined;

  if (!row) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  req.tenantId = row.tenant_id;
  next();
}
