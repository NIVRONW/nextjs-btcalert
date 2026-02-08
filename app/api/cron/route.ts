// app/api/cron/route.ts
import { NextResponse } from "next/server";

function j(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getProvidedSecret(req: Request) {
  const url = new URL(req.url);

  const fromHeader = (req.headers.get("x-cron-secret") || "").trim();
  const fromQuery = (url.searchParams.get("secret") || "").trim();

  const auth = (req.headers.get("authorization") || "").trim();
  const fromBearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  return fromHeader || fromQuery || fromBearer;
}

function escapeHTML(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function sendTelegramHTML(html: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      ok: false,
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID",
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ AUTH
    const expected = (process.env.CRON_SECRET || "").trim();
    const provided = getProvidedSecret(req);

    if (!expected) return j({ ok: false, error: "CRON_SECRET missing" }, 500);
    if (!provided || provided !== expected)
      return j({ ok: false, error: "Unauthorized" }, 401);

    // ✅ params
    const force = url.searchParams.get("force") === "1";

    // ⬇️ Aquí va tu lógica real. Por ahora uso valores demo/placeholder:
    const payload = {
      at: Date.now(),
      price: 69236.5,
      score: 15,
      verdict: false,
      reason: [
        "Rebote >= 0.3% desde minimo 2h",
        "Precio >= EMA50",
        "Precio < EMA200 (tendencia debil)",
      ],
    };

    const shouldSend = force || (payload.verdict && payload.score >= 80);

    let telegram: any = { ok: false, skipped: true };

    if (shouldSend) {
      const headline = "🚨 AHORA ES UN BUEN MOMENTO PARA INVERTIR [CRON-V10]";
      const msg =
        `<b>${escapeHTML(headline)}</b>\n\n` +
        `<b>Precio actual:</b> $${payload.price.toFixed(2)}\n\n` +
        `<b>Score:</b> ${payload.score}\n` +
        `<b>Verdict:</b> ${payload.verdict ? "TRUE" : "FALSE"}\n\n` +
        `<b>Motivos:</b>\n` +
        `${payload.reason.slice(0, 6).map((r) => `• ${escapeHTML(r)}`).join("\n")}\n\n` +
        `<b>Hora:</b> ${escapeHTML(new Date(payload.at).toLocaleString())}` +
        (force ? `\n\n<b>Modo:</b> PRUEBA (force=1)` : "");

      telegram = await sendTelegramHTML(msg);
    }

    return j({
      ok: true,
      at: payload.at,
      verdict: payload.verdict,
      score: payload.score,
      price: payload.price,
      reason: payload.reason,
      force,
      shouldSend,
      telegram,
    });
  } catch (err: any) {
    return j({ ok: false, error: err?.message ?? String(err) }, 500);
  }
}

// ✅ Permite GET también (para navegador / QStash si lo tienes en GET)
export async function GET(req: Request) {
  return POST(req);
}
