import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const STAR_PACKS: Record<string, { gameStars: number; tgStars: number; label: string }> = {
  pack_1:     { gameStars: 1,     tgStars: 1,     label: "1 Звезда" },
  pack_500:   { gameStars: 500,   tgStars: 500,   label: "500 Звёзд" },
  pack_1500:  { gameStars: 1500,  tgStars: 1500,  label: "1500 Звёзд" },
  pack_5000:  { gameStars: 5000,  tgStars: 5000,  label: "5000 Звёзд" },
  pack_15000: { gameStars: 15000, tgStars: 15000, label: "15000 Звёзд" },
};

async function tgPost(method: string, body: object) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// POST /api/payments/invoice
router.post("/invoice", async (req, res) => {
  const { packId, telegramUserId, customAmount } = req.body as {
    packId: string;
    telegramUserId: string;
    customAmount?: number;
  };

  if (!telegramUserId) {
    res.status(400).json({ error: "Нет telegramUserId" });
    return;
  }

  let pack: { gameStars: number; tgStars: number; label: string };
  let resolvedPackId = packId;

  if (packId === "custom") {
    const amount = Math.floor(Number(customAmount));
    if (!amount || amount < 1 || amount > 100000) {
      res.status(400).json({ error: "Сумма должна быть от 1 до 100 000" });
      return;
    }
    pack = { gameStars: amount, tgStars: amount, label: `${amount} Звёзд` };
    resolvedPackId = `custom_${amount}`;
  } else {
    const found = STAR_PACKS[packId];
    if (!found) {
      res.status(400).json({ error: "Неверный пак" });
      return;
    }
    pack = found;
  }

  const payload = `${telegramUserId}:${resolvedPackId}:${Date.now()}`;

  const result = await tgPost("createInvoiceLink", {
    title: pack.label,
    description: `Пополнение баланса StreamRush на ${pack.gameStars} ⭐`,
    payload,
    currency: "XTR",
    prices: [{ label: pack.label, amount: pack.tgStars }],
  }) as any;

  if (!result.ok) {
    res.status(500).json({ error: result.description || "Ошибка Telegram API" });
    return;
  }

  await pool.query(
  `INSERT INTO users (telegram_id, balance)
   VALUES ($1, $2)
   ON CONFLICT (telegram_id)
   DO UPDATE SET balance = users.balance + EXCLUDED.balance`,
  [buyerId, purchase.game_stars]
);

  res.json({ invoiceUrl: result.result });
});

// POST /api/payments/webhook
router.post("/webhook", async (req, res) => {
  const update = req.body as any;

  if (update.pre_checkout_query) {
    await tgPost("answerPreCheckoutQuery", {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok: true,
    });
    res.json({ ok: true });
    return;
  }

 if (update.message?.successful_payment) {
  const payload: string = update.message.successful_payment.invoice_payload;
  const buyerId = String(update.message.from?.id ?? "");

  // 1. ищем покупку
  const { rows: purchases } = await pool.query(
    `SELECT * FROM purchases 
     WHERE telegram_payload = $1 AND status = 'pending' 
     LIMIT 1`,
    [payload]
  );

  // 2. отмечаем покупку как выполненную
  await pool.query(
    `UPDATE purchases 
     SET status = 'completed' 
     WHERE telegram_payload = $1 AND status = 'pending'`,
    [payload]
  );

  // 3. начисляем баланс + бонусы
  if (purchases.length > 0 && buyerId) {
    const purchase = purchases[0];

    // 🔥 ОБНОВЛЕНИЕ БАЛАНСА ПОЛЬЗОВАТЕЛЯ
    await pool.query(
      `UPDATE users
       SET balance = balance + $1
       WHERE telegram_id = $2`,
      [purchase.game_stars, buyerId]
    );

    // бонус рефералу
    const bonusStars = Math.floor(purchase.game_stars * 0.05);

    if (bonusStars > 0) {
      const { rows: refs } = await pool.query(
        `SELECT * FROM referrals WHERE referred_id = $1 LIMIT 1`,
        [buyerId]
      );

      if (refs.length > 0) {
        const ref = refs[0];

        await pool.query(
          `INSERT INTO purchases 
           (telegram_user_id, pack_id, game_stars, tg_stars, telegram_payload, status, claimed)
           VALUES ($1, 'referral_bonus', $2, 0, $3, 'completed', 0)`,
          [ref.referrer_id, bonusStars, `ref:${ref.referrer_id}:${buyerId}:${Date.now()}`]
        );

        await pool.query(
          `UPDATE referrals 
           SET total_bonus_earned = total_bonus_earned + $1 
           WHERE id = $2`,
          [bonusStars, ref.id]
        );
      }
    }
  }

  return res.json({ ok: true });
}

  const text: string = update.message?.text ?? "";
  const chatId: number = update.message?.chat?.id;

  if (chatId && (text === "/start" || text === "/play" || text.startsWith("/start ") || text.startsWith("/play "))) {
    const domain = process.env.APP_DOMAIN;
    const parts = text.trim().split(" ");
    const startParam = parts[1] ?? "";
    const refCode = startParam.startsWith("ref_") ? startParam.slice(4) : "";
    const appUrl = refCode ? `https://${domain}/?ref=${refCode}` : `https://${domain}/`;

    await tgPost("sendMessage", {
      chat_id: chatId,
      text: "🚀 *StreamRush* — стримерский краш\\-симулятор\\!\n\nВыходи в эфир, расти множитель и забирай деньги до краша\\.",
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [[{ text: "🚀 Запустить игру", web_app: { url: appUrl } }]],
      },
    });
  }

  res.json({ ok: true });
});

// GET /api/payments/credits/:userId
router.get("/credits/:userId", async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, game_stars FROM purchases
     WHERE telegram_user_id = $1 AND status = 'completed' AND claimed = 0`,
    [userId]
  );
  const total = rows.reduce((sum: number, r: any) => sum + r.game_stars, 0);

  if (rows.length > 0) {
    await pool.query(
      `UPDATE purchases 
       SET claimed = 1 
       WHERE telegram_user_id = $1 AND status = 'completed' AND claimed = 0`,
      [userId]
    );
  }

  res.json({ credits: total, count: rows.length });
});


// 🔥 ВСТАВЛЯЕШЬ ВОТ ЭТО
router.get("/balance/:userId", async (req, res) => {
  const { userId } = req.params;

  const { rows } = await pool.query(
    `SELECT balance FROM users WHERE telegram_id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    return res.json({ balance: 0 });
  }

  res.json({ balance: rows[0].balance });
});


export default router;
