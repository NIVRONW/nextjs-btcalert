export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function escapeHTML(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function sendTelegramHTML(html: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID" };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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
  if (!b) return 0;
  return ((a - b) / b) * 100;
}

async function fetchHourlyBTC(limitHours: number) {
  // CryptoCompare histohour: limit max 2000
  const limit = Math.min(2000, Math.max(210, limitHours));
  const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USD&limit=${limit}`;

  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data?.Response !== "Success") {
    return { ok: false, status: res.status, data };
  }

  const arr = data?.Data?.Data || [];
  const closes = arr
    .map((c: any) => Number(c.close))
    .filter((n: any) => Number.isFinite(n));

  return { ok: true, closes, raw: data };
}

export async function POST(req: Request) {
  try {
    // ✅ AUTH Bearer
    const expected = (process.env.CRON_SECRET || "").trim();
    const provided = getBearer(req);

    if (!expected || provided !== expected) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    // ✅ force
    const urlObj = new URL(req.url);
    const force = urlObj.searchParams.get("force") === "1";

    // ✅ Data REAL (CryptoCompare)
    const got = await fetchHourlyBTC(240); // ~10 días
    if (!got.ok) {
      return json(
        { ok: false, error: "CryptoCompare error", status: got.status, detail: got.data },
        500
      );
    }

    const closes = got.closes;
    if (closes.length < 210) {
      return json({ ok: false, error: "Not enough price data", points: closes.length }, 500);
    }

    const price = closes[closes.length - 1];

    const ema50 = ema(closes.slice(-60), 50);
    const ema200 = ema(closes.slice(-220), 200);
    const rsi14 = rsi(closes.slice(-60), 14);

    const last3 = closes.slice(-3);
    const low2h = Math.min(...last3);
    const rebound2h = pct(price, low2h);

    const price1h = closes.length >= 2 ? closes[closes.length - 2] : price;
    const price24h = closes.length >= 25 ? closes[closes.length - 25] : price;

    const change1h = pct(price, price1h);
    const change24h = pct(price, price24h);

    // ✅ Score (0-100) + motivos
    let score = 0;
    const reasons: string[] = [];

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

    const distEma50 = Math.abs(pct(price, ema50));
    if (distEma50 <= 0.35) {
      score += 20;
      reasons.push("Precio cerca de EMA50 (pullback sano)");
    } else if (distEma50 <= 0.8) {
      score += 10;
      reasons.push("Precio moderadamente cerca de EMA50");
    } else {
      reasons.push("Precio lejos de EMA50 (entrada menos favorable)");
    }

    if (rsi14 !== null) {
      if (rsi14 >= 42 && rsi14 <= 62) {
        score += 15;
        reasons.push(`RSI14 saludable (${rsi14.toFixed(1)})`);
      } else if (rsi14 > 62 && rsi14 <= 72) {
        score += 6;
        reasons.push(`RSI14 algo alto (${rsi14.toFixed(1)})`);
      } else if (rsi14 < 42 && rsi14 >= 35) {
        score += 6;
        reasons.push(`RSI14 algo bajo (${rsi14.toFixed(1)})`);
      } else {
        reasons.push(`RSI14 extremo (${rsi14.toFixed(1)})`);
      }
    } else {
      reasons.push("RSI14 no disponible");
    }

    if (rebound2h >= 0.30) {
      score += 10;
      reasons.push(`Rebote >= 0.3% desde mínimo 2h (+${rebound2h.toFixed(2)}%)`);
    } else {
      reasons.push(`Rebote 2h bajo (+${rebound2h.toFixed(2)}%)`);
    }

    // ✅ Más activo
    const VERY_GOOD_SCORE = 75;

    const verdict =
      score >= VERY_GOOD_SCORE &&
      price >= ema200 &&
      ema50 >= ema200 &&
      (rsi14 === null || (rsi14 >= 38 && rsi14 <= 72));

    // ✅ force=1 SIEMPRE manda
    const shouldSend = force || (verdict && score >= VERY_GOOD_SCORE);

    let telegram: any = { ok: false, skipped: true };

    if (shouldSend) {
      const headline = "🚨 AHORA ES UN BUEN MOMENTO PARA INVERTIR 🚨";

const msg =
  `<b>${escapeHTML(headline)}</b>\n\n` +
  `<b>Precio actual:</b> $${price.toFixed(2)}\n\n` +
  `<b>Motivo:</b>\n` +
  `${reasons.slice(0, 3).map((r) => `• ${escapeHTML(r)}`).join("\n")}\n\n` +
  `<b>Fecha y hora:</b> ${escapeHTML(new Date().toLocaleString())}`;

telegram = await sendTelegramHTML(msg);
    }

    return json({
  ok: true,
  at: Date.now(),
  price,
  alert: shouldSend,
  force,
  reason: reasons.slice(0, 3),
  telegram: {
    ok: telegram?.ok ?? false,
    status: telegram?.status ?? null,
  },
  source: "CryptoCompare",
});

  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? String(err) }, 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
