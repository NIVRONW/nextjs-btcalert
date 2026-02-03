export const runtime = "nodejs";

export async function GET() {
  try {
    const end = Date.now();
    const start = end - 24 * 60 * 60 * 1000;

    const url =
      `https://api.coincap.io/v2/assets/bitcoin/history` +
      `?interval=m5&start=${start}&end=${end}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    }).finally(() => clearTimeout(timeout));

    const text = await res.text();

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

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return Response.json(
        { error: "bad_json_from_upstream", body: text.slice(0, 300) },
        { status: 502 }
      );
    }

    const arr = json?.data;
    if (!Array.isArray(arr) || arr.length < 10) {
      return Response.json(
        { error: "bad_series", sample: arr?.slice?.(0, 2) ?? null },
        { status: 502 }
      );
    }

    const prices: [number, number][] = arr
      .map((p: any) => [Number(p.time), Number(p.priceUsd)] as [number, number])
      .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));

    return Response.json({ prices }, { status: 200 });
  } catch (e: any) {
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
