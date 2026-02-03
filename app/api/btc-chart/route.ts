export const runtime = "nodejs";

export async function GET() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1";

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return Response.json({ error: "upstream_error" }, { status: 502 });
    }

    const json = await res.json();
    return Response.json({ prices: json?.prices ?? [] }, { status: 200 });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

