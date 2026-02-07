import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  // Seguridad oficial para Vercel Cron
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const base = new URL(req.url).origin;

  // Llamamos al endpoint que envía a Telegram
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

  return Response.json({
    ok: true,
    cron: "running",
    telegram: data,
  });
}
