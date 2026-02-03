export const runtime = "nodejs";

export async function GET() {
  try {
    // Kraken Ticker 24h
    const url = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD";
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return Response.json(
        { error: "upstream_error", status: res.status, body: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const json = JSON.parse(text);
    const result = json?.result;
    const key = result ? Object.keys(result)[0] : null;
    const t = key ? result[key] : null;

    // c[0] = last trade price, o[0] = today's opening price
    const last = Number(t?.c?.[0]);
    const open = Number(t?.o?.[0]);

    if (!Number.isFinite(last) || !Number.isFinite(open) || open === 0) {
      return Response.json({ error: "bad_data" }, { status: 502 });
    }

    const chg = ((last - open) / open) * 100;
    return Response.json({ chg }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

