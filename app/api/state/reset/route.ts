export const dynamic = "force-dynamic";

import { kv } from "@vercel/kv";

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

export async function POST(req: Request) {
  const expected = (process.env.CRON_SECRET || "").trim();
  const provided = getBearer(req);

  if (!expected || provided !== expected) {
    return json({ ok: false, error: "Unauthorized", build: "STATE-RESET-V1" }, 401);
  }

  await kv.set("btcalert:lastTrade", { lastAction: "NONE", lastAt: 0 });
  return json({ ok: true, build: "STATE-RESET-V1" });
}

export async function GET(req: Request) {
  return POST(req);
}

