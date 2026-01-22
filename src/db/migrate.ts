import fs from 'fs';
import path from 'path';
import { getPool, closePool } from './connection';

async function migrate(): Promise<void> {
  console.log('Running database migrations...');

  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const pool = getPool();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await pool.execute(statement);
      } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`  Table already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    console.log(`  Completed: ${file}`);
  }

  await closePool();
  console.log('Migrations complete!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
