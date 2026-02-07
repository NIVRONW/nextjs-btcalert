import { NextResponse } from "next/server";

type Body = {
  text?: string;
  title?: string;
  price?: number;
  changePct?: number;
  symbol?: string; // ej: BTCUSDT o BTC-USD
};

function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "";
}

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Vercel" },
      { status: 500 }
    );
  }

  let body: Body = {};
  try {
    body = await req.json();
  } catch {}

  const symbol = body.symbol ?? "BTC";
  const title = body.title ?? "Alerta BTC";
  const parts: string[] = [];

  if (body.text) parts.push(body.text);
  if (typeof body.price === "number") parts.push(`Precio: $${fmt(body.price, 2)}`);
  if (typeof body.changePct === "number") parts.push(`Cambio: ${fmt(body.changePct, 2)}%`);

  const text =
    `🚨 ${title}\n` +
    `Activo: ${symbol}\n` +
    (parts.length ? parts.join("\n") : "Sin detalles") +
    `\n\n🕒 ${new Date().toISOString()}`;

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = await resp.json();
  return NextResponse.json({ ok: resp.ok, telegram: data });
}

