import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      marker: "CANDLES-ROUTE-OK",
      time: new Date().toISOString(),
    },
    { status: 200 }
  );
}

