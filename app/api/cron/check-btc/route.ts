export async function GET(req: Request) {
  const base = new URL(req.url).origin;

  // Dispara un mensaje a Telegram usando tu endpoint /api/telegram/send
  const r = await fetch(`${base}/api/telegram/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Upstash Cron Activo 🚀",
      symbol: "BTC",
      text: "Estoy ejecutándome cada minuto aunque la app esté cerrada.",
    }),
  });

  let data: any = null;
  try {
    data = await r.json();
  } catch {
    data = { note: "No JSON response" };
  }

  return Response.json({
    ok: true,
    cron: "OPEN_OK_v1",
    telegram_status: r.status,
    telegram: data,
  });
}
