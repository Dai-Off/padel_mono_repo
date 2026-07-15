/** Aplica backend/db/093_tournament_invite_ttl_optional.sql usando DATABASE_URL o SUPABASE_DB_URL en backend/.env */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function main() {
  if (!dbUrl?.trim()) {
    console.error('Falta DATABASE_URL o SUPABASE_DB_URL en backend/.env');
    console.error('Supabase → Project Settings → Database → Connection string (URI).');
    process.exit(1);
  }

  const sqlPath = path.resolve(__dirname, '../db/093_tournament_invite_ttl_optional.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migración 093_tournament_invite_ttl_optional aplicada.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
