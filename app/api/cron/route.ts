import { NextResponse } from "next/server";

type Candle = { t: number; o: number; h: number; l: number; c: number };

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 1e-9;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// drawdown desde max a min (negativo)
function pct(a: number, b: number) {
  return ((b - a) / a) * 100;
}

async function fetchCandles(): Promise<Candle[]> {
  // 🔁 Ajusta tu fuente actual de velas (la que ya usas para el gráfico).
  // Debe devolver al menos 240 velas de 1m (4h) o 300 velas de 5m.
  // Placeholder: usa tu endpoint existente:
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/market/candles`, { cache: "no-store" });
  if (!res.ok) throw new Error("No pude leer candles");
  return res.json();
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram error: ${body}`);
  }
}

async function shouldAlert(candles: Candle[]) {
  const closes = candles.map(c => c.c);
  const last = closes[closes.length - 1];

  // RSI 14
  const r = rsi(closes, 14);

  // EMA 50 y 200 (para filtro de tendencia)
  const e50 = ema(closes.slice(-300), 50);
  const e200 = ema(closes.slice(-600), 200);

  // Caída en 1h y 24h (si tus velas son 1m)
  const oneHourAgo = closes[Math.max(0, closes.length - 60)];
  const dayAgo = closes[Math.max(0, closes.length - 1440)];

  const change1h = pct(oneHourAgo, last);
  const change24h = pct(dayAgo, last);

  // Rebote desde mínimo reciente (últimos 120m)
  const window = closes.slice(-120);
  const minRecent = Math.min(...window);
  const rebound = pct(minRecent, last);

  // Score
  let score = 0;

  // RSI
  if (r < 25) score += 45;
  else if (r < 30) score += 35;
  else if (r < 35) score += 20;

  // Drawdown (descuento)
  if (change24h <= -3) score += 25;
  if (change1h <= -1.5) score += 20;

  // Confirmación (rebote)
  if (rebound >= 0.3) score += 15;
  else score -= 10; // evita alertar en caída libre

  // Tendencia (filtro)
  if (last >= e50) score += 5;
  if (last >= e200) score += 5;
  else score -= 5;

  const verdict = score >= 70;

  return {
    verdict,
    score,
    last,
    rsi: r,
    change1h,
    change24h,
    rebound,
    e50,
    e200,
  };
}

function authOk(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const ok = !!secret && auth === `Bearer ${secret}`;
  return ok;
}

export async function POST(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const candles = await fetchCandles();
    const res = await shouldAlert(candles);

    // Cooldown simple en KV/DB sería ideal.
    // Por ahora, evitamos spam: solo alerta si el score es alto (>=80).
    if (res.verdict && res.score >= 80) {
      const msg =
        `📌 BTC: *Zona de entrada*\n` +
        `Precio: ${res.last.toFixed(2)}\n` +
        `Score: ${res.score}/100\n` +
        `RSI(14): ${res.rsi.toFixed(1)}\n` +
        `1h: ${res.change1h.toFixed(2)}% | 24h: ${res.change24h.toFixed(2)}%\n` +
        `Rebote(120m): ${res.rebound.toFixed(2)}%\n`;

      await sendTelegram(msg);
    }

    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

