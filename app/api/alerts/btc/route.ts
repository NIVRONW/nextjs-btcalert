import { NextResponse } from "next/server";
import { computeBestMoment } from "@/lib/bestMoment"; // tu motor (tendencia + momentum + vol + condición)

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });

  if (!res.ok) throw new Error(`Telegram error: ${res.status}`);
}

async function fetchBtcSeries1d(): Promise<number[]> {
  // CoinGecko: histórico 1 día (normalmente puntos ~cada 5 min)
  const url =
    "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("CoinGecko error");
  const data = await res.json();
  return (data.prices as [number, number][]).map((x) => x[1]);
}

let state: { lastFireAt?: number } = {}; // en serio: persistir en DB/KV, pero esto sirve para arrancar

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const closes = await fetchBtcSeries1d();
  const now = Date.now();

  const out = computeBestMoment(closes, now, undefined, state);
  state = out.state;

  if (out.fire) {
    await sendTelegram(
      `📈 BTC ALERTA (setup)\nScore=${out.score}\n${out.reason}`
    );
    return NextResponse.json({ ok: true, fired: true, score: out.score });
  }

  return NextResponse.json({ ok: true, fired: false, reason: out.reason });
}

