import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const poolConfig: PoolConfig = {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    if (config.db.ssl) {
      poolConfig.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(poolConfig);
  }
  return pool;
}

/**
 * Convert `?` positional placeholders to `$1, $2, $3...` for PostgreSQL.
 * Skips `?` inside single-quoted string literals.
 */
export function convertPlaceholders(sql: string): string {
  let idx = 0;
  let inString = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && sql[i - 1] !== '\\') {
      inString = !inString;
      result += ch;
    } else if (ch === '?' && !inString) {
      idx++;
      result += `$${idx}`;
    } else {
      result += ch;
    }
  }
  return result;
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T> {
  const p = getPool();
  const pgSql = convertPlaceholders(sql);
  const { rows } = await p.query(pgSql, params);
  return rows as T;
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function run(sql: string, params: unknown[] = []): Promise<number> {
  const p = getPool();
  const pgSql = convertPlaceholders(sql);
  const result = await p.query(pgSql, params);
  return result.rowCount ?? 0;
}

export async function initializePostgres(): Promise<void> {
  const migrationPath = path.join(process.cwd(), 'migrations', 'postgres', '001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const p = getPool();
  await p.query(sql);
  console.log('[PostgreSQL] Schema initialized');

  // Seed default API key
  if (config.apiKey && config.apiKey !== 'demo-api-key') {
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM api_keys WHERE api_key = ?',
      [config.apiKey]
    );
    if (!existing) {
      await run(
        `INSERT INTO api_keys (id, api_key, tenant_id, tenant_name, is_active)
         VALUES (?, ?, 'default-tenant', 'Default Tenant', TRUE)`,
        [uuidv4(), config.apiKey]
      );
      console.log('[PostgreSQL] Default API key seeded');
    }
  }

  // Seed additional API keys from environment
  const tenantKeys = process.env.TENANT_KEYS;
  if (tenantKeys) {
    for (const entry of tenantKeys.split(',')) {
      const [name, key] = entry.split(':');
      if (name && key) {
        const existingKey = await queryOne<{ id: string }>(
          'SELECT id FROM api_keys WHERE api_key = ?',
          [key.trim()]
        );
        if (!existingKey) {
          await run(
            `INSERT INTO api_keys (id, api_key, tenant_id, tenant_name, is_active)
             VALUES (?, ?, ?, ?, TRUE)`,
            [uuidv4(), key.trim(), uuidv4(), name.trim()]
          );
        }
      }
    }
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
