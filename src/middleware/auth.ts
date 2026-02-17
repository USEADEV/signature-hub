import { Request, Response, NextFunction } from 'express';
import { dbQueryOne } from '../db/queries';

interface ApiKeyRow {
  id: string;
  api_key: string;
  tenant_id: string;
  tenant_name: string;
  is_active: number | boolean;
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const row = await dbQueryOne<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE api_key = ? AND is_active = TRUE',
    [apiKey]
  );

  if (!row) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  req.tenantId = row.tenant_id;
  next();
}
