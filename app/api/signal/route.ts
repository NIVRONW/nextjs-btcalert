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
    }>;
  };
};

type SignalPayload = {
  at: number; // epoch ms
  verdict: boolean;
  score: number;
  price: number;
  rsi14: number;
  ema50: number;
  ema200: number;
  change1h: number;
  change24h: number;
  rebound2h: number;
  reason: string[];
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
  const apiKey = process.env.CRYPTOCOMPARE_API_KEY || process.env.CC_API_KEY || "";

  const url = new URL("https://min-api.cryptocompare.com/data/v2/histohour");
  url.searchParams.set("fsym", "BTC");
  url.searchParams.set("tsym", "USD");
  url.searchParams.set("limit", String(limit));
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

function computeSignal(closes: number[]): SignalPayload {
  const lastPrice = closes[closes.length - 1];

  const ema50Arr = ema(closes, 50);
  const ema200Arr = ema(closes, 200);
  const rsi14Arr = rsi(closes, 14);

  const ema50v = ema50Arr[ema50Arr.length - 1];
  const ema200v = ema200Arr[ema200Arr.length - 1];
  const rsi14v = rsi14Arr[rsi14Arr.length - 1];

  // Cambio 1h y 24h (horario)
  const change1h =
    closes.length >= 2 && closes[closes.length - 2] > 0
      ? ((lastPrice - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
      : 0;

  const change24h =
    closes.length >= 25 && closes[closes.length - 25] > 0
      ? ((lastPrice - closes[closes.length - 25]) / closes[closes.length - 25]) * 100
      : 0;

  // Rebote 2h (últimas 2 velas)
  const last2 = closes.slice(-2);
  const min2 = Math.min(...last2);
  const rebound2h =
    min2 > 0 ? ((lastPrice - min2) / min2) * 100 : 0;

  // Condiciones base
  const trendUp = ema50v > ema200v;

  // Scoring (mismo espíritu que ya estabas usando)
  let score = 0;

  // Tendencia
  if (trendUp) score += 45;

  // RSI
  if (Number.isFinite(rsi14v)) {
    const rsiScore = (() => {
      if (rsi14v < 35) return 0;
      if (rsi14v <= 65) return 10 + ((rsi14v - 35) / 30) * 25; // 10..35
      return 20 - ((rsi14v - 65) / 20) * 10; // baja si muy caliente
    })();
    score += clamp(rsiScore, 0, 35);
  }

  // Rebote 2h
  const reboundScore = clamp(rebound2h / 2.0, 0, 1) * 20; // 0..2% => 0..20
  score += reboundScore;

  score = Math.round(clamp(score, 0, 100));

  const reasons: string[] = [];
  if (trendUp) reasons.push("EMA50 > EMA200 (alcista)");
  if (Number.isFinite(rsi14v)) reasons.push(`RSI14 ~${Math.round(rsi14v)}`);
  if (rebound2h >= 0.5) reasons.push(`Rebote 2h +${rebound2h.toFixed(2)}%`);

  // Tu UI usa verdict + score>=80 (ya lo filtras en page.tsx)
  const verdict = score >= 75 && trendUp;

  return {
    at: Date.now(),
    verdict,
    score,
    price: lastPrice,
    rsi14: Number.isFinite(rsi14v) ? rsi14v : 0,
    ema50: Number.isFinite(ema50v) ? ema50v : 0,
    ema200: Number.isFinite(ema200v) ? ema200v : 0,
    change1h,
    change24h,
    rebound2h,
    reason: reasons.length ? reasons : ["Sin confirmación fuerte"],
  };
}

export async function GET() {
  try {
    // Pedimos suficientes velas para EMA200 + 24h atrás
    const rows = await fetchCryptoCompareHourly(260);
    const closes = rows
      .map((r) => r.close)
      .filter((n) => Number.isFinite(n) && n > 0);

    if (closes.length < 220) {
      const payload: SignalPayload = {
        at: Date.now(),
        verdict: false,
        score: 0,
        price: closes.at(-1) ?? 0,
        rsi14: 0,
        ema50: 0,
        ema200: 0,
        change1h: 0,
        change24h: 0,
        rebound2h: 0,
        reason: ["Datos insuficientes para EMA200"],
      };
      return NextResponse.json({ ok: true, lastSignal: payload }, { status: 200 });
    }

    const payload = computeSignal(closes);

    // ✅ Esto es lo que tu page.tsx espera:
    return NextResponse.json({ ok: true, lastSignal: payload }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "signal_error" },
      { status: 500 }
    );
  }
}
