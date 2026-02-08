import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CCResp = {
  Response?: string;
  Message?: string;
  Data?: {
    Data?: Array<{
      time: number; // unix seconds
      open: number;
      high: number;
      low: number;
      close: number;
    }>;
  };
};

type Candle = {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
};

async function fetchCryptoCompareCandles(limit: number) {
  const apiKey =
    process.env.CRYPTOCOMPARE_API_KEY || process.env.CC_API_KEY || "";

  const url = new URL("https://min-api.cryptocompare.com/data/v2/histohour");
  url.searchParams.set("fsym", "BTC");
  url.searchParams.set("tsym", "USD");
  url.searchParams.set("limit", String(limit));
  if (apiKey) url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CryptoCompare ${res.status}: ${txt.slice(0, 180)}`);
  }

  const json = (await res.json()) as CCResp;
  if (json.Response && json.Response !== "Success") {
    throw new Error(`CryptoCompare error: ${json.Message || "Unknown"}`);
  }

  const rows = json.Data?.Data || [];
  if (!rows.length) throw new Error("CryptoCompare: sin velas");

  const candles: Candle[] = rows
    .map((r) => ({
      t: r.time * 1000,
      o: Number(r.open),
      h: Number(r.high),
      l: Number(r.low),
      c: Number(r.close),
    }))
    .filter(
      (x) =>
        Number.isFinite(x.t) &&
        Number.isFinite(x.o) &&
        Number.isFinite(x.h) &&
        Number.isFinite(x.l) &&
        Number.isFinite(x.c)
    );

  return candles;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // cantidad de velas (horas). Default 72 = 3 días (bonito para ver velas)
    const limitParam = searchParams.get("limit");
    const limit = Math.max(
      24,
      Math.min(500, Number(limitParam ?? "72") || 72)
    );

    const candles = await fetchCryptoCompareCandles(limit);

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

