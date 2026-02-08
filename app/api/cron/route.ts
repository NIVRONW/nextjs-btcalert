import { NextResponse } from "next/server";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

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

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += -diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function pct(a: number, b: number) {
  // % change from b to a
  if (!b) return 0;
  return ((a - b) / b) * 100;
}

export async function POST(req: Request) {
  // ✅ AUTH (Bearer)
  const expected = (process.env.CRON_SECRET || "").trim();
  const provided = getBearer(req);

  if (!expected || provided !== expected) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // ✅ Obtener data REAL desde CoinGecko (gratis)
  // Necesitamos >= 200 puntos horarios para EMA200 => pedimos 10 días (240h aprox)
  const url =
    "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=10&interval=hourly";

  const cg = await fetch(url, {
    headers: { "Accept": "application/json" },
    // cache off para que sea lo más fresco posible
    cache: "no-store",
  });

  if (!cg.ok) {
    return json({ ok: false, error: "CoinGecko error", status: cg.status }, 500);
  }

  const data = await cg.json();
  const prices: [number, number][] = data?.prices || [];
  if (prices.length < 210) {
    return json({ ok: false, error: "Not enough price data", points: prices.length }, 500);
  }

  // Serie de cierres (precios)
  const closes = prices.map((p) => p[1]);
  const price = closes[closes.length - 1];

  // Indicadores
  const ema50 = ema(closes.slice(-60), 50);         // usamos últimas ~60 horas
  const ema200 = ema(closes.slice(-220), 200);      // últimas ~220 horas
  const rsi14 = rsi(closes.slice(-60), 14);         // suficiente para RSI14

  // Rebote desde mínimo de 2h (2 puntos atrás + actual)
  const last3 = closes.slice(-3);
  const low2h = Math.min(...last3);
  const rebound2h = pct(price, low2h); // % rebote desde mínimo 2h

  // Cambios 1h y 24h aprox
  const price1h = closes.length >= 2 ? closes[closes.length - 2] : price;
  const price24h = closes.length >= 25 ? closes[closes.length - 25] : price;

  const change1h = pct(price, price1h);
  const change24h = pct(price, price24h);

  // ✅ SCORING REAL (0 - 100) + razones
  let score = 0;
  const reasons: string[] = [];

  // Tendencia fuerte
  if (price >= ema200) {
    score += 30;
    reasons.push("Precio >= EMA200 (tendencia alcista)");
  } else {
    reasons.push("Precio < EMA200 (tendencia débil)");
  }

  if (ema50 >= ema200) {
    score += 25;
    reasons.push("EMA50 >= EMA200 (momentum positivo)");
  } else {
    reasons.push("EMA50 < EMA200 (momentum débil)");
  }

  // Pullback sano: cerca de EMA50 (no comprar “arriba”)
  const distEma50 = Math.abs(pct(price, ema50)); // % de distancia
  if (distEma50 <= 0.35) {
    score += 20;
    reasons.push("Precio cerca de EMA50 (pullback sano)");
  } else if (distEma50 <= 0.8) {
    score += 10;
    reasons.push("Precio moderadamente cerca de EMA50");
  } else {
    reasons.push("Precio lejos de EMA50 (posible entrada mala)");
  }

  // RSI zona buena (ni sobrecomprado ni muy débil)
  if (rsi14 !== null) {
    if (rsi14 >= 42 && rsi14 <= 62) {
      score += 15;
      reasons.push(`RSI14 saludable (${rsi14.toFixed(1)})`);
    } else if (rsi14 > 62 && rsi14 <= 70) {
      score += 6;
      reasons.push(`RSI14 algo alto (${rsi14.toFixed(1)})`);
    } else if (rsi14 < 42 && rsi14 >= 35) {
      score += 6;
      reasons.push(`RSI14 algo bajo (${rsi14.toFixed(1)})`);
    } else {
      reasons.push(`RSI14 extremo (${rsi14.toFixed(1)})`);
    }
  }

  // Rebote desde mínimo 2h (señal de reacción)
  if (rebound2h >= 0.30) {
    score += 10;
    reasons.push(`Rebote >= 0.3% desde mínimo 2h (+${rebound2h.toFixed(2)}%)`);
  } else {
    reasons.push(`Rebote 2h bajo (+${rebound2h.toFixed(2)}%)`);
  }

  // ✅ Verdict “muy buena oportunidad”
  // (estricto, como pediste)
  const VERY_GOOD_SCORE = 75;

  const verdict =
    score >= VERY_GOOD_SCORE &&
    price >= ema200 &&
    ema50 >= ema200 &&
    (rsi14 === null || (rsi14 >= 38 && rsi14 <= 68));

  const shouldSend = verdict && score >= VERY_GOOD_SCORE;

  // ✅ Telegram: solo cuando sea MUY buena oportunidad
  if (shouldSend) {
    const msg =
      `🚨 MUY BUENA OPORTUNIDAD BTC\n\n` +
      `Precio: $${price.toFixed(2)}\n` +
      `Score: ${score}\n` +
      `RSI14: ${rsi14 === null ? "N/A" : rsi14.toFixed(1)}\n` +
      `EMA50: ${ema50.toFixed(2)}\n` +
      `EMA200: ${ema200.toFixed(2)}\n` +
      `Δ1h: ${change1h.toFixed(2)}%\n` +
      `Δ24h: ${change24h.toFixed(2)}%\n\n` +
      `Motivos:\n- ${reasons.slice(0, 6).join("\n- ")}\n\n` +
      `Hora: ${new Date().toLocaleString()}`;

    await sendTelegram(msg);
  }

  return json({
    ok: true,
    at: Date.now(),
    price,
    score,
    verdict,
    alert: shouldSend,
    rsi14,
    ema50,
    ema200,
    change1h,
    change24h,
    rebound2h,
    reason: reasons,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
