export const runtime = "nodejs";

export async function GET() {
  try {
    const url = "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=5";

    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const text = await res.text();
    if (!res.ok) {
      return Response.json(
        { error: "upstream_error", status: res.status, body: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const json = JSON.parse(text);
    const result = json?.result;
    const keys = result ? Object.keys(result).filter((k) => k !== "last") : [];
    const firstKey = keys[0];
    const ohlc = firstKey ? result[firstKey] : null;

    if (!Array.isArray(ohlc) || ohlc.length < 10) {
      return Response.json({ error: "bad_series" }, { status: 502 });
    }

    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;

    const prices: [number, number][] = ohlc
      .map((row: any[]) => [Number(row?.[0]) * 1000, Number(row?.[4])] as [number, number])
      .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p))
      .filter(([t]) => t >= start && t <= end);

    return Response.json({ prices }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
