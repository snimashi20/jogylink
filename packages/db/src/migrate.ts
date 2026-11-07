import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env)');

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(__dirname, '../../../database/migrations'),
    });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
