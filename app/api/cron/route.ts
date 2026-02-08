// Telegram:
// - PRUEBA si force=1
// - ALERTA REAL solo cuando verdict=true y score>=80
const shouldSend = force || (verdict && score >= 80);

if (shouldSend) {
  const headline = "🚨 AHORA ES UN BUEN MOMENTO PARA INVERTIR [CRON-V10]";

  const msg =
    `<b>${headline}</b>\n\n` +
    `<b>Precio actual:</b> $${payload.price.toFixed(2)}\n\n` +
    `<b>Motivos:</b>\n` +
    `${(payload.reason || []).slice(0, 4).map((r) => `• ${r}`).join("\n")}\n\n` +
    `<b>Hora:</b> ${new Date(payload.at).toLocaleString()}`;

  await sendTelegramHTML(msg);
}
