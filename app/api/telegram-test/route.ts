export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

async function tgGetMe(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function tgSend(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: Request) {
  try {
    // ✅ proteger como cron
    const expected = (process.env.CRON_SECRET || "").trim();
    const provided = getBearer(req);
    if (!expected || provided !== expected) {
      return json({ ok: false, error: "Unauthorized", build: "TELEGRAM-TEST-V1" }, 401);
    }

    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    const chatId = process.env.TELEGRAM_CHAT_ID || "";

    if (!token) return json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN", build: "TELEGRAM-TEST-V1" }, 500);
    if (!chatId) return json({ ok: false, error: "Missing TELEGRAM_CHAT_ID", build: "TELEGRAM-TEST-V1" }, 500);

    const me = await tgGetMe(token);

    const msg = `TEST BTCALERT ✅ (desde Vercel)\nChatId: ${chatId}\nFecha: ${new Date().toLocaleString("en-US")}`;
    const sent = await tgSend(token, chatId, msg);

    return json({
      ok: true,
      build: "TELEGRAM-TEST-V1",
      envChatId: chatId,
      bot: {
        ok: me.ok,
        status: me.status,
        username: me?.data?.result?.username ?? null,
        first_name: me?.data?.result?.first_name ?? null,
      },
      send: sent, // ✅ trae el error real si falla
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "error", build: "TELEGRAM-TEST-V1" }, 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}

