import { NextResponse } from "next/server";
import { getSignal } from "@/app/lib/signalStore";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, lastSignal: getSignal() });
}
