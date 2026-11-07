import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { seed } from './seed';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env)');

  const production = process.env.NODE_ENV === 'production';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? (production ? '' : 'owner-dev-password');
  const workerPassword =
    process.env.SEED_WORKER_PASSWORD ?? (production ? '' : 'worker-dev-password');

  if (!ownerPassword || !workerPassword) {
    throw new Error('Set SEED_OWNER_PASSWORD and SEED_WORKER_PASSWORD when seeding production');
  }
  if (!process.env.SEED_OWNER_PASSWORD) {
    console.warn('Using DEV default passwords (owner-dev-password / worker-dev-password).');
  }

  const pool = new Pool({ connectionString: url });
  try {
    await seed(drizzle(pool), { ownerPassword, workerPassword });
    console.log('Seed complete: 2 users, settings, 30 sample products.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
