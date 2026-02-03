export const runtime = "nodejs";

export async function GET() {
  try {
    // CoinCap: datos del asset (precio + cambio 24h)
    const url = "https://api.coincap.io/v2/assets/bitcoin";

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return Response.json(
        { error: "upstream_error", status: res.status },
        { status: 502 }
      );
    }

    const json = await res.json();
    const data = json?.data;

    const usd = Number(data?.priceUsd);
    const chg = Number(data?.changePercent24Hr);

    if (!Number.isFinite(usd) || !Number.isFinite(chg)) {
      return Response.json({ error: "bad_data" }, { status: 502 });
    }

    return Response.json({ usd, chg }, { status: 200 });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
