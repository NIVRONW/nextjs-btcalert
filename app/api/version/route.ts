export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    marker: "BTC-CRON-DEPLOY-VERIFY-V1",
    time: new Date().toISOString(),
  });
}
