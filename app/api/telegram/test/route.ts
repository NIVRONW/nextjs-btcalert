import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Vercel" },
      { status: 500 }
    );
  }

  const text = `✅ Telegram conectado | ${new Date().toISOString()}`;

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = await resp.json();

  return NextResponse.json({
    ok: resp.ok,
    telegram: data,
  });
}
