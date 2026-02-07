import { NextResponse } from "next/server";
import { setSignal } from "../../lib/signalStore";

export const runtime = "nodejs";

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
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

function pct(from: number, to: number) {
  return ((to - from) / from) * 100;
}

async function fetchPrices24h_5m(): Promise<[number, number][]> {
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=5";
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Upstream ${res.status}: ${text.slice(0, 160)}`);

  const json = JSON.parse(text);
  const result = json?.result;
  const keys = result ? Object.keys(result).filter((k: string) => k !== "last") : [];
  const firstKey = keys[0];
  const ohlc = firstKey ? result[firstKey] : null;

  if (!Array.isArray(ohlc) || ohlc.length < 220) throw new Error("bad_series");

  const end = Date.now();
  const start = end - 24 * 60 * 60 * 1000;

  const prices: [number, number][] = ohlc
    .map((row: any[]) => [Number(row?.[0]) * 1000, Number(row?.[4])] as [number, number])
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p)) // ✅ => correcto
    .filter(([t]) => t >= start && t <= end);

  prices.sort((a, b) => a[0] - b[0]);
  return prices;
}

function authOk(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const authRaw = (req.headers.get("authorization") ?? "").trim();

  const token = authRaw.toLowerCase().startsWith("bearer ")
    ? authRaw.slice(7).trim()
    : "";

  return secret.length > 0 && token === secret;
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram error: ${body.slice(0, 200)}`);
  }
}

export async function POST(req: Request) {
  // 🔎 DEBUG TEMPORAL si 401
  if (!authOk(req)) {
    const secret = (process.env.CRON_SECRET ?? "").trim();
    const authRaw = (req.headers.get("authorization") ?? "").trim();
    const token = authRaw.toLowerCase().startsWith("bearer ")
      ? authRaw.slice(7).trim()
      : "";

    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
        debug: {
          hasSecret: secret.length > 0,
          secretLen: secret.length,
          authHeader: authRaw || null,
          tokenLen: token.length,
          tokenMatches: token === secret,
        },
      },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";

    const series = await fetchPrices24h_5m();
    const closes = series.map(([, p]) => p);
    const last = closes[closes.length - 1];

    if (closes.length < 210) {
      return NextResponse.json({ ok: false, error: "not_enough_data" }, { status: 500 });
    }

    const rsi14 = rsi(closes, 14);
    const ema50 = ema(closes.slice(-120), 50);
    const ema200 = ema(closes.slice(-260), 200);

    const oneHourAgo = closes[Math.max(0, closes.length - 12)];
    const dayAgo = closes[0];

    const change1h = pct(oneHourAgo, last);
    const change24h = pct(dayAgo, last);

    const last2h = closes.slice(-24);
    const min2h = Math.min(...last2h);
    const rebound2h = pct(min2h, last);

    let score = 0;
    const reason: string[] = [];

    if (rsi14 < 25) {
      score += 45;
      reason.push("RSI<25 (muy sobrevendido)");
    } else if (rsi14 < 30) {
      score += 35;
      reason.push("RSI<30 (sobrevendido)");
    } else if (rsi14 < 35) {
      score += 20;
      reason.push("RSI<35 (debilidad)");
    }

    if (change24h <= -3) {
      score += 25;
      reason.push("Caída 24h ≥ 3%");
    }
    if (change1h <= -1.5) {
      score += 20;
      reason.push("Caída 1h ≥ 1.5%");
    }

    if (rebound2h >= 0.3) {
      score += 15;
      reason.push("Rebote ≥ 0.3% desde mínimo 2h");
    } else {
      score -= 10;
      reason.push("Sin rebote (evitar caída libre)");
    }

    if (last >= ema50) {
      score += 5;
      reason.push("Precio ≥ EMA50");
    }
    if (last >= ema200) {
      score += 5;
      reason.push("Precio ≥ EMA200");
    } else {
      score -= 5;
      reason.push("Precio < EMA200 (tendencia débil)");
    }

    const verdict = score >= 70;

    const payload = {
      at: Date.now(),
      verdict,
      score,
      price: last,
      rsi14,
      ema50,
      ema200,
      change1h,
      change24h,
      rebound2h,
      reason,
    };

    setSignal(payload);

    if ((verdict && score >= 80) || force) {
      const msg =
        `📌 BTC: ${force ? "PRUEBA (force)" : "ZONA DE ENTRADA"}\n` +
        `Precio: $${payload.price.toFixed(2)}\n` +
        `Score: ${payload.score}/100\n` +
        `RSI(14): ${payload.rsi14.toFixed(1)}\n` +
        `1h: ${payload.change1h.toFixed(2)}% | 24h: ${payload.change24h.toFixed(2)}%\n` +
        `Rebote(2h): ${payload.rebound2h.toFixed(2)}%\n` +
        `Razones: ${(payload.reason || []).slice(0, 3).join(" • ")}`;

      await sendTelegram(msg);
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
