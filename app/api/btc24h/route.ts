export const runtime = "nodejs";

function pct(from: number, to: number) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return 0;
  return ((to - from) / from) * 100;
}

async function fetchPrices24h_5m(): Promise<[number, number][]> {
  const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=5";

  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  const text = await res.text();
  if (!res.ok) {
    return Promise.reject(new Error(`Upstream ${res.status}: ${text.slice(0, 160)}`));
  }

  const json = JSON.parse(text);
  const result = json?.result;
  const keys = result ? Object.keys(result).filter((k: string) => k !== "last") : [];
  const firstKey = keys[0];
  const ohlc = firstKey ? result[firstKey] : null;

  if (!Array.isArray(ohlc) || ohlc.length < 20) {
    throw new Error("bad_series");
  }

  const end = Date.now();
  const start = end - 24 * 60 * 60 * 1000;

  const prices: [number, number][] = ohlc
    .map((row: any[]) => [Number(row?.[0]) * 1000, Number(row?.[4])] as [number, number])
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p))
    .filter(([t]) => t >= start && t <= end);

  prices.sort((a, b) => a[0] - b[0]);
  return prices;
}

export async function GET() {
  try {
    const series = await fetchPrices24h_5m();

    if (!Array.isArray(series) || series.length < 10) {
      return Response.json({ chg: null, error: "not_enough_data" }, { status: 200 });
    }

    const first = series[0]?.[1];
    const last = series[series.length - 1]?.[1];

    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) {
      return Response.json({ chg: null, error: "bad_values" }, { status: 200 });
    }

    const chg = pct(first, last);

    // opcional: redondeo suave
    const chgRounded = Math.round(chg * 100) / 100;

    return Response.json({ chg: chgRounded }, { status: 200 });
  } catch (e: any) {
    // No rompas la UI por fallos upstream: devolvemos chg:null
    return Response.json(
      { chg: null, error: "server_error", message: e?.message ?? String(e) },
      { status: 200 }
    );
  }
}
