export const runtime = "nodejs";

export async function GET() {
  try {
    // Kraken Ticker 24h (público)
    const url = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD";

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

    // La key dentro de result puede variar (ej: XXBTZUSD), tomamos la primera
    const key = result ? Object.keys(result).find((k) => k !== "last") : null;
    const t = key ? result[key] : null;

    // c[0] = last trade price, o[0] = opening price (hace ~24h)
    const last = Number(t?.c?.[0]);
    const open = Number(t?.o?.[0]);

    if (!Number.isFinite(last) || !Number.isFinite(open) || open === 0) {
      return Response.json({ error: "bad_data" }, { status: 502 });
    }

    const chg = ((last - open) / open) * 100;

    return Response.json({ chg }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: "server_error", name: e?.name ?? null, message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
