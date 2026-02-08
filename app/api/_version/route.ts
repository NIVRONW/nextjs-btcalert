import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    marker: "BTC-CRON-DEPLOY-VERIFY-V1",
    time: new Date().toISOString(),
  });
}
