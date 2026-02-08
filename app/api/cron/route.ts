import { NextResponse } from "next/server";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getSecret(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
}

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET!;
  const provided = getSecret(req);

  if (!expected || provided !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // ⬇️ Aquí tu lógica actual (NO tocar si ya funciona)
  const price = 69000;        // ejemplo
  const score = Math.floor(Math.random() * 100); // ejemplo
  const verdict = score >= 85;

  const VERY_GOOD_SCORE = 85;

  const shouldSend = verdict && score >= VERY_GOOD_SCORE;

  if (shouldSend) {
    await sendTelegram(
      `🚨 MUY BUENA OPORTUNIDAD BTC\n\nPrecio: $${price}\nScore: ${score}`
    );
  }

  return json({
    ok: true,
    price,
    score,
    verdict,
    alert: shouldSend,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
