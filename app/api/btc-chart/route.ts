export const runtime = "nodejs";

export async function GET() {
  try {
    // Últimas 24h
    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;

    // CoinCap histórico: puntos por intervalo (m5 = cada 5 min, se ve más “en tiempo real”)
    const url =
      `https://api.coincap.io/v2/assets/bitcoin/history` +
      `?interval=m5&start=${start}&end=${end}`;

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return Response.json(
        { error: "upstream_error", status: res.status },
        { status: 502 }
      );
    }

    const json = await res.json();
    const arr = json?.data;

    if (!Array.isArray(arr) || arr.length < 10) {
      return Response.json({ error: "bad_series" }, { status: 502 });
    }

    // Lo devolvemos en formato compatible con tu page.tsx: [timeMs, price]
    const prices: [number, number][] = arr
      .map((p: any) => [Number(p.time), Number(p.priceUsd)] as [number, number])
      .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));

    return Response.json({ prices }, { status: 200 });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
