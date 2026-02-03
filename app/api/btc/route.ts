export const runtime = "nodejs";

export async function GET() {
  try {
    // Coinbase spot (sin auth)
    const url = "https://api.coinbase.com/v2/prices/BTC-USD/spot";

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
    const amount = Number(json?.data?.amount);

    if (!Number.isFinite(amount)) {
      return Response.json({ error: "bad_data" }, { status: 502 });
    }

    // Coinbase spot no trae % 24h, así que aquí devolvemos chg=null
    return Response.json({ usd: amount, chg: null }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
