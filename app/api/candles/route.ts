import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = Math.max(24, Math.min(500, Number(limitParam ?? "72") || 72));

    const apiKey = process.env.CRYPTOCOMPARE_API_KEY || process.env.CC_API_KEY || "";

    const url = new URL("https://min-api.cryptocompare.com/data/v2/histohour");
    url.searchParams.set("fsym", "BTC");
    url.searchParams.set("tsym", "USD");
    url.searchParams.set("limit", String(limit));
    if (apiKey) url.searchParams.set("api_key", apiKey);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json || (json.Response && json.Response !== "Success")) {
      return NextResponse.json(
        { ok: false, error: "CryptoCompare error", status: res.status, detail: json },
        { status: 500 }
      );
    }

    const rows = json?.Data?.Data ?? [];
    const candles = rows
      .map((r: any) => ({
        t: Number(r.time) * 1000,
        o: Number(r.open),
        h: Number(r.high),
        l: Number(r.low),
        c: Number(r.close),
      }))
      .filter(
        (x: any) =>
          Number.isFinite(x.t) &&
          Number.isFinite(x.o) &&
          Number.isFinite(x.h) &&
          Number.isFinite(x.l) &&
          Number.isFinite(x.c)
      );

    return NextResponse.json(
      { ok: true, candles, source: "CryptoCompare", limit },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "candles_error" },
      { status: 500 }
    );
  }
}
