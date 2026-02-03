export const runtime = "nodejs";

export async function GET() {
  try {
    // Kraken OHLC público. interval=5 (minutos), devuelve hasta 720 puntos.
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

    // Kraken devuelve result con key variable (ej: "XXBTZUSD"). Tomamos la primera.
    const result = json?.result;
    const keys = result ? Object.keys(result).filter((k) => k !== "last") : [];
    const firstKey = keys[0];
    const ohlc = firstKey ? result[firstKey] : null;

    if (!Array.isArray(ohlc) || ohlc.length < 10) {
      return Response.json(
        { error: "bad_series", sample: ohlc?.slice?.(0, 2) ?? null },
        { status: 502 }
      );
    }

    // Formato para tu frontend: [time_ms, close]
    const prices: [number, number][] = ohlc
      .map((row: any[]) => {
        const tSec = Number(row?.[0]);      // timestamp en segundos
        const close = Number(row?.[4]);     // close
        return [tSec * 1000, close] as [number, number];
      })
      .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p));

    return Response.json({ prices }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
