import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = new URL(req.url).searchParams.get("secret");

  // Seguridad: que solo Vercel Cron lo pueda llamar
  if (!secret || got !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Ejemplo simple: mensaje para confirmar que el cron corre
  const base = new URL(req.url).origin;

  const resp = await fetch(`${base}/api/telegram/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Cron activo ✅",
      symbol: "BTC",
      text: "Estoy corriendo aunque la app esté cerrada.",
    }),
  });

  const data = await resp.json();
  return NextResponse.json({ ok: true, sent: data });
}

