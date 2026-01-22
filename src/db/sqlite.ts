import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

export function getSqliteDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'signatures.db');

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    initializeTables(db);
  }
  return db;
}

function initializeTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signature_requests (
      id TEXT PRIMARY KEY,
      external_ref TEXT,
      external_type TEXT,
      document_name TEXT NOT NULL,
      document_content TEXT,
      document_url TEXT,
      signer_name TEXT NOT NULL,
      signer_email TEXT,
      signer_phone TEXT,
      verification_method TEXT DEFAULT 'email',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      signed_at TEXT,
      callback_url TEXT,
      created_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_external_ref ON signature_requests(external_ref);
    CREATE INDEX IF NOT EXISTS idx_status ON signature_requests(status);
    CREATE INDEX IF NOT EXISTS idx_signer_email ON signature_requests(signer_email);

    CREATE TABLE IF NOT EXISTS signature_tokens (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      verification_code TEXT,
      code_expires_at TEXT,
      code_attempts INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT,
      FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_token ON signature_tokens(token);

    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      signature_type TEXT NOT NULL,
      typed_name TEXT,
      signature_image TEXT,
      signer_ip TEXT,
      user_agent TEXT,
      signed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      verification_method_used TEXT,
      consent_text TEXT,
      FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
    );
  `);
}

export function closeSqliteDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
