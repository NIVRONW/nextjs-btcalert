export const runtime = "nodejs";

export async function GET() {
  try {
    const url = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD";

    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const text = await res.text();

    if (!res.ok) {
      return Response.json(
        { error: "upstream_error", status: res.status },
        { status: 502 }
      );
    }

    const json = JSON.parse(text);
    const result = json?.result;
    const key = result ? Object.keys(result)[0] : null;
    const t = key ? result[key] : null;

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
