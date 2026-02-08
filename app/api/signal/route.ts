import { NextResponse } from "next/server";

type CCResp = {
  Response?: string;
  Message?: string;
  Data?: {
    Data?: Array<{
      time: number; // unix seconds
      close: number;
      open: number;
      high: number;
      low: number;
      volumefrom?: number;
      volumeto?: number;
    }>;
  };
};

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    const next = v * k + prev * (1 - k);
    out.push(next);
    prev = next;
  }
  return out;
}

function rsi(values: number[], period = 14): number[] {
  if (values.length < period + 1) return [];
  const out: number[] = new Array(values.length).fill(NaN);

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  out[period] = 100 - 100 / (1 + rs0);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }

  return out;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function fetchCryptoCompareHourly(limit: number) {
  // Tu app ya usa histohour. Aquí igual:
  // limit = cantidad de velas - 1 (CryptoCompare devuelve limit+1 puntos)
  const apiKey = process.env.CRYPTOCOMPARE_API_KEY || process.env.CC_API_KEY || "";

  const url = new URL("https://min-api.cryptocompare.com/data/v2/histohour");
  url.searchParams.set("fsym", "BTC");
  url.searchParams.set("tsym", "USD");
  url.searchParams.set("limit", String(limit));

  // Si tienes API key, la agregamos (si no, funciona igual pero puede rate-limit)
  if (apiKey) url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CryptoCompare ${res.status}: ${txt.slice(0, 180)}`);
  }

  const json = (await res.json()) as CCResp;

  if (json.Response && json.Response !== "Success") {
    throw new Error(`CryptoCompare error: ${json.Message || "Unknown"}`);
  }

  const rows = json.Data?.Data || [];
  if (!rows.length) throw new Error("CryptoCompare: sin datos");

  return rows;
}

function computeSignalFromHourly(closes: number[]) {
  // Basado en velas HORARIAS
  // EMA50/EMA200: necesitan suficiente data, así que pedimos >= 220 velas
  const lastPrice = closes[closes.length - 1];

  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);

  const e50 = ema50[ema50.length - 1];
  const e200 = ema200[ema200.length - 1];
  const rLast = rsi14[rsi14.length - 1];

  // Rebote 2h (en histohour: 2 velas)
  const last2 = closes.slice(-2);
  const min2 = Math.min(...last2);
  const reboundPct = min2 > 0 ? (lastPrice - min2) / min2 : 0;

  const trendUp = e50 > e200;
  const rsiOk = Number.isFinite(rLast) ? rLast >= 45 : false;
  const reboundOk = reboundPct >= 0.005; // 0.5% en 2h (ajustable)

  // Score 0-100 (simple y estable)
  let score = 0;
  if (trendUp) score += 45;

  if (Number.isFinite(rLast)) {
    const rsiScore = (() => {
      if (rLast < 35) return 0;
      if (rLast <= 65) return 10 + ((rLast - 35) / 30) * 25; // 10..35
      return 20 - ((rLast - 65) / 20) * 10; // baja si está muy caliente
    })();
    score += clamp(rsiScore, 0, 35);
  }

  const reboundScore = clamp(reboundPct / 0.02, 0, 1) * 20; // 0..2% => 0..20
  score += reboundScore;

  score = Math.round(clamp(score, 0, 100));

  const reasons: string[] = [];
  if (trendUp) reasons.push("Tendencia alcista (EMA50 > EMA200)");
  if (Number.isFinite(rLast)) reasons.push(`RSI ~${Math.round(rLast)}`);
  if (reboundOk) reasons.push(`Rebote 2h (+${(reboundPct * 100).toFixed(1)}%)`);

  const shouldAlert = score >= 75 && trendUp && (rsiOk || reboundOk);

  return {
    shouldAlert,
    price: lastPrice,
    reason: reasons.length ? reasons.join(" · ") : "Señal no confirmada",
    at: new Date().toISOString(),
    debug: { score, e50, e200, rsi: rLast, reboundPct },
  };
}

export async function GET() {
  try {
    // Para EMA200 en horario, pide mínimo ~220 velas (9+ días).
    // limit=260 => ~261 puntos (~10-11 días)
    const rows = await fetchCryptoCompareHourly(260);
    const closes = rows.map((r) => r.close).filter((n) => Number.isFinite(n) && n > 0);

    if (closes.length < 220) {
      return NextResponse.json(
        {
          ok: true,
          shouldAlert: false,
          price: closes.at(-1) ?? 0,
          reason: "Datos insuficientes para EMA200.",
          at: new Date().toISOString(),
          debug: { len: closes.length },
        },
        { status: 200 }
      );
    }

    const signal = computeSignalFromHourly(closes);
    return NextResponse.json({ ok: true, ...signal }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "signal_error" },
      { status: 500 }
    );
  }
}
