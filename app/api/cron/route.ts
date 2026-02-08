import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;

    if (!auth || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "1";

    // ==========================
    // EJEMPLO DE DATOS (USA LOS TUYOS SI YA LOS CALCULAS)
    // ==========================
    const payload = {
      at: Date.now(),
      price: 69408.9,
      reason: [
        "Rebote >= 0.3% desde mínimo 2h",
        "Precio >= EMA50",
        "Precio >= EMA200",
      ],
    };

    // ==========================
    // MENSAJE TELEGRAM
    // ==========================
    const headline = "🚨 AHORA ES UN BUEN MOMENTO PARA INVERTIR";

    const message =
      `<b>${headline}</b>\n\n` +
      `<b>Precio actual:</b> $${payload.price.toFixed(2)}\n\n` +
      `<b>Motivos:</b>\n` +
      `${payload.reason.map((r) => `• ${r}`).join("\n")}\n\n` +
      `<b>Hora:</b> ${new Date(payload.at).toLocaleString()}`;

    if (force) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "server_error", message: err.message }, { status: 500 });
  }
}
