export const dynamic = "force-dynamic";

import { kv } from "@vercel/kv";

/** Respuesta JSON */
function json(data: any, status = 200) {
  return Response.json(data, { status });
}

/** Lee token Bearer */
function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

/** Escapa para HTML en Telegram */
function escapeHTML(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Formato numérico: 1,000.01 */
function formatNumberUS(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Enviar Telegram (HTML) */
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

/** EMA */
function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

/** RSI */
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

/** % cambio */
function pct(a: number, b: number) {
  if (!b) return 0;
  return ((a - b) / b) * 100;
}

/** Precios hora a hora de BTC (CryptoCompare) */
async function fetchHourlyBTC(limitHours: number) {
  const limit = Math.min(2000, Math.max(210, limitHours));
  const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USD&limit=${limit}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data?.Response !== "Success") {
    return { ok: false, status: res.status, data };
  }

  const arr = data?.Data?.Data || [];
  const closes = arr
    .map((c: any) => Number(c.close))
    .filter((n: any) => Number.isFinite(n));

  return { ok: true, closes };
}

type Action = "BUY" | "SELL" | "NONE";

type TradeState = {
  lastAction: Action;
  lastAt: number; // ms
  lastPrice?: number;
};

const KV_KEY = "btcalert:lastTrade";

async function readState(): Promise<TradeState> {
  try {
    const s = (await kv.get(KV_KEY)) as TradeState | null;
    if (s && typeof s.lastAt === "number" && typeof s.lastAction === "string") return s;
  } catch {}
  return { lastAction: "NONE", lastAt: 0 };
}

async function writeState(state: TradeState) {
  try {
    await kv.set(KV_KEY, state);
  } catch {}
}

export async function POST(req: Request) {
  try {
    // ✅ AUTH: Bearer CRON_SECRET
    const expected = (process.env.CRON_SECRET || "").trim();
    const provided = getBearer(req);

    if (!expected || provided !== expected) {
      return json({ ok: false, error: "Unauthorized", build: "CRON-SAFE-KV-V1" }, 401);
    }

    const urlObj = new URL(req.url);

    // ✅ force=1 (prueba)
    const force = urlObj.searchParams.get("force") === "1";

    // ✅ action=BUY|SELL solo cuando force=1
    const forcedActionRaw = (urlObj.searchParams.get("action") || "").toUpperCase();
    const forcedAction: "BUY" | "SELL" | "" =
      forcedActionRaw === "BUY" ? "BUY" : forcedActionRaw === "SELL" ? "SELL" : "";

    // ✅ Data real
    const got = await fetchHourlyBTC(240);
    if (!got.ok) {
      return json(
        { ok: false, error: "CryptoCompare error", status: got.status, detail: got.data, build: "CRON-SAFE-KV-V1" },
        500
      );
    }

    const closes = got.closes;
    if (closes.length < 210) {
      return json({ ok: false, error: "Not enough price data", points: closes.length, build: "CRON-SAFE-KV-V1" }, 500);
    }

    const price = closes[closes.length - 1];

    const ema50 = ema(closes.slice(-60), 50);
    const ema200 = ema(closes.slice(-220), 200);
    const rsi14 = rsi(closes.slice(-60), 14);

    // % cambio 1h
    const prev1h = closes[closes.length - 2] || price;
    const change1h = pct(price, prev1h);

    // Rebote 2h (últimas 3 velas)
    const last3 = closes.slice(-3);
    const low2h = Math.min(...last3);
    const rebound2h = pct(price, low2h);

    // ====== SCORE / REASONS ======
    let score = 0;
    const reasons: string[] = [];

    const trendStrong = price >= ema200 && ema50 >= ema200; // ✅ filtro de seguridad BUY
    const trendWeak = price < ema200 && ema50 < ema200;

    if (price >= ema200) {
      score += 30;
      reasons.push("Tendencia positiva (precio por encima del promedio largo)");
    } else {
      reasons.push("Tendencia debil (precio por debajo del promedio largo)");
    }

    if (ema50 >= ema200) {
      score += 25;
      reasons.push("Momentum positivo (promedio corto por encima del largo)");
    } else {
      reasons.push("Momentum debil (promedio corto por debajo del largo)");
    }

    const distEma50 = Math.abs(pct(price, ema50));
    if (distEma50 <= 0.35) {
      score += 20;
      reasons.push("Entrada favorable (precio cerca del promedio corto)");
    } else if (distEma50 <= 0.8) {
      score += 10;
      reasons.push("Entrada aceptable (precio relativamente cerca del promedio corto)");
    } else {
      reasons.push("Entrada menos favorable (precio lejos del promedio corto)");
    }

    if (rsi14 !== null) {
      if (rsi14 >= 42 && rsi14 <= 62) {
        score += 15;
        reasons.push("Impulso saludable (ni sobrecomprado ni sobrevendido)");
      } else if (rsi14 > 62 && rsi14 <= 74) {
        score += 6;
        reasons.push("Impulso algo alto (posible sobrecompra ligera)");
      } else if (rsi14 < 42 && rsi14 >= 34) {
        score += 6;
        reasons.push("Impulso algo bajo (posible rebote)");
      } else {
        reasons.push("Impulso extremo (cautela)");
      }
    }

    if (rebound2h >= 0.25) {
      score += 10;
      reasons.push("Rebote reciente confirmado");
    }

    const BUY_MIN_SCORE = 60;
    const SELL_MIN_SCORE = 55;

    // ✅ BUY SEGURO: SOLO EN TENDENCIA ESTRUCTURAL ALCISTA
    const buyVerdict =
      score >= BUY_MIN_SCORE &&
      trendStrong &&
      price >= ema50 &&
      (rsi14 === null || (rsi14 >= 38 && rsi14 <= 72)) &&
      rebound2h >= 0.25;

    // ✅ SELL: salida por deterioro estructural (más útil cuando ya estás dentro)
    const sellVerdict =
      score >= SELL_MIN_SCORE &&
      (price < ema50 || ema50 < ema200) &&
      (rsi14 === null || rsi14 >= 50);

    // ====== COOLDOWN + EMERGENCY ======
    const state = await readState();
    const now = Date.now();

    const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas
    const inCooldown = state.lastAction === "BUY" && now - state.lastAt < COOLDOWN_MS;

    // ✅ Emergencia: si cae fuerte durante cooldown → SELL inmediato
    const emergencySell =
      inCooldown && (change1h <= -1.0 || price < ema50 * 0.995);

    let action: Action = "NONE";

    if (force && forcedAction) {
      action = forcedAction;
    } else if (emergencySell) {
      action = "SELL";
      reasons.unshift("🔴 VENTA", "Salida de emergencia (caída fuerte durante cooldown)");
    } else {
      // cooldown: evita señales cruzadas rápidas
      if (inCooldown) {
        action = "NONE";
      } else {
        action = buyVerdict ? "BUY" : sellVerdict ? "SELL" : "NONE";
        if (action === "BUY") reasons.unshift("🟢 COMPRA");
        if (action === "SELL") reasons.unshift("🔴 VENTA");
      }
    }

    const shouldSend = force || action !== "NONE";

    let telegram: any = { ok: false, skipped: true };

    if (shouldSend) {
      const headline =
        action === "SELL"
          ? "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴"
          : "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";

      const ahora = new Date();

const hora = ahora.toLocaleTimeString("en-US", {
  timeZone: "America/New_York",
});

const fecha = ahora.toLocaleDateString("en-US", {
  timeZone: "America/New_York",
});
      
      // Solo 3 motivos
      const motivos = reasons.slice(0, 3);
      const motivoTxt =
        motivos.length > 0
          ? motivos.map((r) => `• ${escapeHTML(r)}`).join("\n")
          : "• Condiciones favorables detectadas";

      const msg =
        `<b>${escapeHTML(headline)}</b>\n\n` +
        `<b>PRECIO:</b> $${formatNumberUS(price)}\n\n` +
        `<b>MOTIVO:</b>\n${motivoTxt}\n\n` +
        `<b>HORA:</b> ${escapeHTML(hora)}\n` +
        `<b>FECHA:</b> ${escapeHTML(fecha)}`;

      telegram = await sendTelegramHTML(msg);

      // ✅ Guardar estado SOLO en señales reales (nunca en force=1)
if (!force && (action === "BUY" || action === "SELL")) {
  await writeState({ lastAction: action, lastAt: now, lastPrice: price });
}
    }

    return json({
      ok: true,
      build: "CRON-SAFE-KV-V1",
      at: now,
      source: "CryptoCompare",

      // debug
      price,
      ema50,
      ema200,
      rsi14,
      rebound2h,
      change1h,
      score,
      trendStrong,
      trendWeak,
      buyVerdict,
      sellVerdict,
      state,
      inCooldown,
      emergencySell,

      action,
      forcedAction,
      alert: shouldSend,
      force,
      reason: reasons.slice(0, 3),
      telegram: {
  ok: telegram?.ok ?? false,
  status: telegram?.status ?? null,
  data: telegram?.data ?? null, // ✅ para ver el error exacto
},
    });
  } catch (err: any) {
    return json({ ok: false, error: err?.message ?? String(err), build: "CRON-SAFE-KV-V1" }, 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
