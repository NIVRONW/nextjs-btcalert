export const dynamic = "force-dynamic";

/** Respuesta JSON */
function json(data: any, status = 200) {
  return Response.json(data, { status });
}

/** Lee token Bearer */
function getBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

/** Enviar Telegram (HTML o texto simple) */
async function sendTelegram(token: string, chatId: string, text: string) {
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
    // ✅ AUTH: Bearer CRON_SECRET
    const expected = (process.env.CRON_SECRET || "").trim();
    const provided = getBearer(req);

    if (!expected || provided !== expected) {
      return json({ ok: false, error: "Unauthorized", build: "TELEGRAM-TEST-V2" }, 401);
    }

    // ✅ LEE SOLO ESTO (la variable correcta)
    const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();

    // 👇 diagnóstico adicional (para cazar “variable equivocada”)
    const debug = {
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? null,
      TELEGRAM_CHAT_ID_len: (process.env.TELEGRAM_CHAT_ID || "").length,
      TELEGRAM_CHAT_ID_trim: chatId,

      TELEGRAM_CHATID: (process.env as any).TELEGRAM_CHATID ?? null,
      TELEGRAM_GROUP_ID: (process.env as any).TELEGRAM_GROUP_ID ?? null,
      TELEGRAM_CHAT: (process.env as any).TELEGRAM_CHAT ?? null,
    };

    if (!token) {
      return json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN", build: "TELEGRAM-TEST-V2", debug }, 500);
    }
    if (!chatId) {
      return json({ ok: false, error: "Missing TELEGRAM_CHAT_ID", build: "TELEGRAM-TEST-V2", debug }, 500);
    }

    const msg =
      `✅ TEST BTCALERT (grupo)\n` +
      `chat_id=${chatId}\n` +
      `hora=${new Date().toLocaleString("en-US")}`;

    const send = await sendTelegram(token, chatId, msg);

    return json(
      {
        ok: true,
        build: "TELEGRAM-TEST-V2",
        envChatId: chatId,
        send,
        debug,
      },
      200
    );
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "telegram_test_error", build: "TELEGRAM-TEST-V2" }, 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
