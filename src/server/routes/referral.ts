import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

async function getBotUsername(): Promise<string> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const r = await res.json() as any;
    return r.result?.username ?? "StreamRushBot";
  } catch {
    return "StreamRushBot";
  }
}

// GET /api/referral/info/:userId
router.get("/info/:userId", async (req, res) => {
  const { userId } = req.params;
  const botUsername = await getBotUsername();

  const { rows } = await pool.query(
    `SELECT * FROM referrals WHERE referrer_id = $1`,
    [userId]
  );

  const totalEarned = rows.reduce((s: number, r: any) => s + r.total_bonus_earned, 0);

  res.json({
    referralCode: `ref_${userId}`,
    referralLink: `https://t.me/${botUsername}?start=ref_${userId}`,
    referredCount: rows.length,
    totalEarned,
  });
});

// POST /api/referral/register
router.post("/register", async (req, res) => {
  const { referrerId, newUserId } = req.body as { referrerId: string; newUserId: string };

  if (!referrerId || !newUserId) {
    res.status(400).json({ error: "Не хватает параметров" });
    return;
  }
  if (referrerId === newUserId) {
    res.status(400).json({ error: "Нельзя пригласить себя" });
    return;
  }

  const { rows: existing } = await pool.query(
    `SELECT id FROM referrals WHERE referred_id = $1 LIMIT 1`,
    [newUserId]
  );

  if (existing.length > 0) {
    res.json({ ok: true, alreadyRegistered: true });
    return;
  }

  await pool.query(
    `INSERT INTO referrals (referrer_id, referred_id, total_bonus_earned) VALUES ($1, $2, 0)`,
    [referrerId, newUserId]
  );

  res.json({ ok: true, alreadyRegistered: false });
});

export default router;
