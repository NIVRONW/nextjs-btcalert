export const runtime = "nodejs";

export async function GET() {
  try {
    const url = "https://api.coincap.io/v2/assets/bitcoin";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    }).finally(() => clearTimeout(timeout));

    const text = await res.text();

    // Si CoinCap responde pero con error, lo mostramos
    if (!res.ok) {
      return Response.json(
        {
          error: "upstream_error",
          status: res.status,
          body: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    // Parse seguro
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return Response.json(
        { error: "bad_json_from_upstream", body: text.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = json?.data;
    const usd = Number(data?.priceUsd);
    const chg = Number(data?.changePercent24Hr);

    if (!Number.isFinite(usd) || !Number.isFinite(chg)) {
      return Response.json(
        { error: "bad_data", sample: { priceUsd: data?.priceUsd, changePercent24Hr: data?.changePercent24Hr } },
        { status: 502 }
      );
    }

    return Response.json({ usd, chg }, { status: 200 });
  } catch (e: any) {
    // 👇 Aquí veremos el motivo real
    return Response.json(
      {
        error: "server_error",
        name: e?.name ?? null,
        message: e?.message ?? String(e),
        cause: e?.cause ? String(e.cause) : null,
      },
      { status: 500 }
    );
  }
}
