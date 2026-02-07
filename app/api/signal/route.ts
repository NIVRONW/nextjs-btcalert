import { NextResponse } from "next/server";

let lastSignal: any = null;

export function GET() {
  return NextResponse.json({ ok: true, lastSignal });
}

// Solo lo usa cron internamente
export function _setSignal(v: any) {
  lastSignal = v;
}

