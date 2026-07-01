/** Aplica backend/db/087_account_deletion.sql usando DATABASE_URL o SUPABASE_DB_URL en backend/.env */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function main() {
  if (!dbUrl?.trim()) {
    console.error('Falta DATABASE_URL o SUPABASE_DB_URL en backend/.env');
    console.error('Copiá la connection string de Supabase → Project Settings → Database.');
    process.exit(1);
  }

  const migrations = ['087_account_deletion.sql', '088_anonymize_player_rpc.sql'];
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    for (const file of migrations) {
      const sqlPath = path.resolve(__dirname, '../db', file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      console.log(`Migración ${file} aplicada.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
