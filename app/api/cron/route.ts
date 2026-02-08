// app/api/cron/route.ts
import { NextResponse } from "next/server";

function j(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ Seguridad: CRON_SECRET (header o query)
    const expected = process.env.CRON_SECRET || "";
    const provided =
      req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";

    if (!expected) return j({ ok: false, error: "CRON_SECRET missing" }, 500);
    if (!provided || provided !== expected)
      return j({ ok: false, error: "Unauthorized" }, 401);

    // ✅ Force manual (solo si force=1 en la URL)
    const force = url.searchParams.get("force") === "1";

    // TODO: aquí va tu payload real (precio, reasons, at, verdict, score)
    // Esto es ejemplo; reemplázalo por tu lógica real:
    const payload = {
      price: Number(url.searchParams.get("price") || 65000.12),
      reason: ["Ejemplo: pullback en tendencia", "RSI en zona neutral"],
      at: Date.now(),
    };

    const verdict = url.searchParams.get("verdict") === "true"; // o tu cálculo real
    const score = Number(url.searchParams.get("score") || 0);   // o tu cálculo real

    // Telegram:
    // - PRUEBA si force=1
    // - ALERTA REAL solo cuando verdict=true y score>=80
    const shouldSend = force || (verdict && score >= 80);

    let telegram: any = { ok: false, skipped: true };

    if (shouldSend) {
      const headline = "🚨 AHORA ES UN BUEN MOMENTO PARA INVERTIR [CRON-V10]";

      const msg =
        `<b>${escapeHTML(headline)}</b>\n\n` +
        `<b>Precio actual:</b> $${payload.price.toFixed(2)}\n\n` +
        `<b>Motivos:</b>\n` +
        `${(payload.reason || [])
          .slice(0, 4)
          .map((r) => `• ${escapeHTML(r)}`)
          .join("\n")}\n\n` +
        `<b>Hora:</b> ${escapeHTML(new Date(payload.at).toLocaleString())}` +
        (force ? `\n\n<b>Modo:</b> PRUEBA (force=1)` : "");

      telegram = await sendTelegramHTML(msg);
    }

    return j({
      ok: true,
      force,
      verdict,
      score,
      shouldSend,
      telegram,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    return j(
      { ok: false, error: "Server error", detail: err?.message ?? String(err) },
      500
    );
  }
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

// Evita que caracteres rompan HTML
function escapeHTML(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
