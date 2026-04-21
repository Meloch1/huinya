import balanceRouter from "./routes/balance.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { initDb } from "./db.js";
import paymentsRouter from "./routes/payments.js";
import referralRouter from "./routes/referral.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/balance", balanceRouter);
app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
app.use("/api/payments", paymentsRouter);
app.use("/api/referral", referralRouter);

// Serve frontend static files
const staticDir = path.resolve(__dirname, "../public");
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
 app.get("/", (_req, res) => {
  res.send("SERVER WORKS");
});

const port = Number(process.env.PORT ?? 8080);

initDb()
  .then(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
    setupBot();
  })
  .catch((err) => {
    console.error("Failed to init DB:", err);
    process.exit(1);
  });

async function tgPost(method: string, body: object): Promise<{ ok: boolean; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; description?: string }>;
}

async function setupBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const domain = process.env.APP_DOMAIN;
  if (!token || !domain) {
    console.warn("TELEGRAM_BOT_TOKEN or APP_DOMAIN not set — bot setup skipped");
    return;
  }

  const appUrl = `${domain}/`;
const webhookUrl = `${domain}/api/payments/webhook`;

  try {
    const r = await tgPost("setWebhook", { url: webhookUrl });
    console.log(r.ok ? `Webhook set: ${webhookUrl}` : `Webhook failed: ${r.description}`);
  } catch (e) { console.error("Webhook error:", e); }

  try {
    await tgPost("setChatMenuButton", {
      menu_button: { type: "web_app", text: "Играть 🚀", web_app: { url: appUrl } },
    });
  } catch (e) { console.error("Menu button error:", e); }

  try {
    await tgPost("setMyCommands", {
      commands: [
        { command: "start", description: "Открыть StreamRush 🚀" },
        { command: "play", description: "Запустить игру" },
      ],
    });
  } catch (e) { console.error("Commands error:", e); }
}
