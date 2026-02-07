export async function GET(req: Request) {
  const base = new URL(req.url).origin;

  await fetch(`${base}/api/telegram/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Upstash Cron Activo 🚀",
      symbol: "BTC",
      text: "Estoy ejecutándome cada minuto aunque la app esté cerrada.",
    }),
  });

  return Response.json({ ok: true });
}
