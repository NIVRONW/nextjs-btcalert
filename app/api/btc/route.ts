export const runtime = "nodejs";

export async function GET() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return Response.json({ error: "upstream_error" }, { status: 502 });
    }

    const json = await res.json();
    const usd = json?.bitcoin?.usd;
    const chg = json?.bitcoin?.usd_24h_change;

    return Response.json({ usd, chg }, { status: 200 });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

