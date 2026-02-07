import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const base = new URL(req.url).origin;

  const resp = await fetch(`${base}/api/telegram/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Demo",
      symbol: "BTC",
      price: 65000.12,
      changePct: -1.34,
      text: "Prueba POST disparada desde un GET (sin Postman).",
    }),
  });

  const data = await resp.json();
  return NextResponse.json({ ok: resp.ok, send: data });
}

