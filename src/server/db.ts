import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      telegram_user_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      game_stars INTEGER NOT NULL,
      tg_stars INTEGER NOT NULL,
      telegram_payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      claimed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL,
      total_bonus_earned INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("Database tables ready");
}
