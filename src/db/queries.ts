import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { config } from '../config';
import {
  SignatureRequest,
  SignatureToken,
  Signature,
  CreateRequestInput,
  RequestFilters,
  RequestStatus,
} from '../types';

// Import database modules
import { query as mysqlQuery, queryOne as mysqlQueryOne } from './connection';
import { getSqliteDb } from './sqlite';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateVerificationCode(): string {
  if (config.demoMode) {
    return config.verification.demoCode;
  }
  const min = Math.pow(10, config.verification.codeLength - 1);
  const max = Math.pow(10, config.verification.codeLength) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

// Helper for SQLite queries
function sqliteQuery<T>(sql: string, params: unknown[] = []): T[] {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

function sqliteQueryOne<T>(sql: string, params: unknown[] = []): T | null {
  const results = sqliteQuery<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

function sqliteRun(sql: string, params: unknown[] = []): void {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  stmt.run(...params);
}

// Generic query functions that route to the right DB
async function query<T>(sql: string, params: unknown[] = []): Promise<T> {
  if (config.dbType === 'sqlite') {
    // Convert MySQL placeholders (?) to SQLite format (already compatible)
    return sqliteQuery<T>(sql.replace(/NOW\(\)/g, "datetime('now')"), params) as T;
  }
  return mysqlQuery<T>(sql, params);
}

async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  if (config.dbType === 'sqlite') {
    return sqliteQueryOne<T>(sql.replace(/NOW\(\)/g, "datetime('now')"), params);
  }
  return mysqlQueryOne<T>(sql, params);
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  if (config.dbType === 'sqlite') {
    sqliteRun(sql.replace(/NOW\(\)/g, "datetime('now')"), params);
    return;
  }
  await mysqlQuery(sql, params);
}

// Signature Requests

export async function createRequest(input: CreateRequestInput): Promise<{ request: SignatureRequest; token: SignatureToken }> {
  const requestId = uuidv4();
  const tokenId = uuidv4();
  const token = generateToken();

  const expiresAt = input.expiresAt || new Date(Date.now() + config.request.defaultExpiryDays * 24 * 60 * 60 * 1000);
  const expiresAtStr = expiresAt.toISOString();

  await run(
    `INSERT INTO signature_requests
     (id, external_ref, external_type, document_name, document_content, document_url,
      signer_name, signer_email, signer_phone, verification_method, status, expires_at, callback_url, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      requestId,
      input.externalRef || null,
      input.externalType || null,
      input.documentName,
      input.documentContent || null,
      input.documentUrl || null,
      input.signerName,
      input.signerEmail || null,
      input.signerPhone || null,
      input.verificationMethod || 'email',
      expiresAtStr,
      input.callbackUrl || null,
      input.createdBy || null,
    ]
  );

  await run(
    `INSERT INTO signature_tokens (id, request_id, token) VALUES (?, ?, ?)`,
    [tokenId, requestId, token]
  );

  const request = await getRequestById(requestId);
  const tokenRecord = await getTokenByRequestId(requestId);

  return { request: request!, token: tokenRecord! };
}

export async function getRequestById(id: string): Promise<SignatureRequest | null> {
  return queryOne<SignatureRequest>(
    `SELECT * FROM signature_requests WHERE id = ?`,
    [id]
  );
}

export async function getRequestByToken(token: string): Promise<SignatureRequest | null> {
  return queryOne<SignatureRequest>(
    `SELECT r.* FROM signature_requests r
     JOIN signature_tokens t ON t.request_id = r.id
     WHERE t.token = ?`,
    [token]
  );
}

export async function updateRequestStatus(id: string, status: RequestStatus): Promise<void> {
  if (status === 'signed') {
    await run(
      `UPDATE signature_requests SET status = ?, signed_at = NOW() WHERE id = ?`,
      [status, id]
    );
  } else {
    await run(
      `UPDATE signature_requests SET status = ? WHERE id = ?`,
      [status, id]
    );
  }
}

export async function listRequests(filters: RequestFilters): Promise<SignatureRequest[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.externalRef) {
    conditions.push('external_ref = ?');
    params.push(filters.externalRef);
  }
  if (filters.externalType) {
    conditions.push('external_type = ?');
    params.push(filters.externalType);
  }
  if (filters.signerEmail) {
    conditions.push('signer_email = ?');
    params.push(filters.signerEmail);
  }
  if (filters.createdBy) {
    conditions.push('created_by = ?');
    params.push(filters.createdBy);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  return query<SignatureRequest[]>(
    `SELECT * FROM signature_requests ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export async function deleteRequest(id: string): Promise<boolean> {
  if (config.dbType === 'sqlite') {
    const db = getSqliteDb();
    const result = db.prepare('DELETE FROM signature_requests WHERE id = ?').run(id);
    return result.changes > 0;
  }
  const result = await mysqlQuery<{ affectedRows: number }>(
    `DELETE FROM signature_requests WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
}

// Signature Tokens

export async function getTokenByRequestId(requestId: string): Promise<SignatureToken | null> {
  const token = await queryOne<SignatureToken>(
    `SELECT * FROM signature_tokens WHERE request_id = ?`,
    [requestId]
  );
  if (token && config.dbType === 'sqlite') {
    // Convert SQLite integer to boolean
    token.is_verified = Boolean(token.is_verified);
  }
  return token;
}

export async function getTokenByValue(token: string): Promise<SignatureToken | null> {
  const result = await queryOne<SignatureToken>(
    `SELECT * FROM signature_tokens WHERE token = ?`,
    [token]
  );
  if (result && config.dbType === 'sqlite') {
    result.is_verified = Boolean(result.is_verified);
  }
  return result;
}

export async function setVerificationCode(tokenId: string): Promise<string> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + config.verification.codeExpiryMinutes * 60 * 1000);

  await run(
    `UPDATE signature_tokens
     SET verification_code = ?, code_expires_at = ?, code_attempts = 0
     WHERE id = ?`,
    [code, expiresAt.toISOString(), tokenId]
  );

  return code;
}

export async function verifyCode(tokenId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const token = await queryOne<SignatureToken>(
    `SELECT * FROM signature_tokens WHERE id = ?`,
    [tokenId]
  );

  if (!token) {
    return { success: false, error: 'Token not found' };
  }

  // Handle SQLite boolean
  const isVerified = config.dbType === 'sqlite' ? Boolean(token.is_verified) : token.is_verified;

  if (isVerified) {
    return { success: true };
  }

  if (token.code_attempts >= config.verification.maxAttempts) {
    return { success: false, error: 'Too many attempts. Please request a new code.' };
  }

  await run(
    `UPDATE signature_tokens SET code_attempts = code_attempts + 1 WHERE id = ?`,
    [tokenId]
  );

  if (!token.verification_code || !token.code_expires_at) {
    return { success: false, error: 'No verification code sent' };
  }

  if (new Date() > new Date(token.code_expires_at)) {
    return { success: false, error: 'Verification code expired' };
  }

  if (token.verification_code !== code) {
    return { success: false, error: 'Invalid verification code' };
  }

  await run(
    `UPDATE signature_tokens SET is_verified = 1, verified_at = NOW() WHERE id = ?`,
    [tokenId]
  );

  return { success: true };
}

// Signatures

export async function createSignature(
  requestId: string,
  signatureType: 'typed' | 'drawn',
  typedName: string | undefined,
  signatureImage: string | undefined,
  signerIp: string,
  userAgent: string,
  verificationMethodUsed: string,
  consentText: string
): Promise<Signature> {
  const id = uuidv4();

  await run(
    `INSERT INTO signatures
     (id, request_id, signature_type, typed_name, signature_image, signer_ip, user_agent, verification_method_used, consent_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, requestId, signatureType, typedName || null, signatureImage || null, signerIp, userAgent, verificationMethodUsed, consentText]
  );

  await updateRequestStatus(requestId, 'signed');

  return (await getSignatureByRequestId(requestId))!;
}

export async function getSignatureByRequestId(requestId: string): Promise<Signature | null> {
  return queryOne<Signature>(
    `SELECT * FROM signatures WHERE request_id = ?`,
    [requestId]
  );
}
