import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getSqliteDb } from '../db/sqlite';

const router = Router();

// Admin auth: separate from tenant API keys
// Uses a dedicated ADMIN_API_KEY env var
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'] as string;
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    res.status(503).json({ error: 'Admin API not configured. Set ADMIN_API_KEY environment variable.' });
    return;
  }
  if (!adminKey || adminKey !== expectedKey) {
    res.status(403).json({ error: 'Invalid admin key' });
    return;
  }
  next();
}

router.use(adminAuth);

// Create a new API key for a tenant
router.post('/api-keys', (req: Request, res: Response) => {
  try {
    const { tenantName } = req.body;
    if (!tenantName) {
      res.status(400).json({ error: 'tenantName is required' });
      return;
    }

    const id = uuidv4();
    const tenantId = uuidv4();
    const apiKey = `sk_${crypto.randomBytes(24).toString('hex')}`;

    const db = getSqliteDb();
    db.prepare(
      `INSERT INTO api_keys (id, api_key, tenant_id, tenant_name, is_active)
       VALUES (?, ?, ?, ?, 1)`
    ).run(id, apiKey, tenantId, tenantName);

    res.status(201).json({
      id,
      apiKey,      // Return once - not retrievable again
      tenantId,
      tenantName,
    });
  } catch (error) {
    console.error('Failed to create API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// List API keys (without revealing key values)
router.get('/api-keys', (_req: Request, res: Response) => {
  try {
    const db = getSqliteDb();
    const keys = db.prepare(
      'SELECT id, tenant_id, tenant_name, is_active, created_at, updated_at FROM api_keys ORDER BY created_at DESC'
    ).all();
    res.json(keys);
  } catch (error) {
    console.error('Failed to list API keys:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Deactivate an API key
router.delete('/api-keys/:id', (req: Request, res: Response) => {
  try {
    const db = getSqliteDb();
    const result = db.prepare(
      "UPDATE api_keys SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.json({ success: true, message: 'API key deactivated' });
  } catch (error) {
    console.error('Failed to deactivate API key:', error);
    res.status(500).json({ error: 'Failed to deactivate API key' });
  }
});

export default router;
