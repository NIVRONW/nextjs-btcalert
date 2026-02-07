export async function GET(req: Request) {
  const url = new URL(req.url);
  const got = url.searchParams.get("secret");
  const envSecret = process.env.CRON_SECRET;

  return Response.json({
    ok: true,
    got: got ?? null,
    gotLen: got?.length ?? 0,
    envLen: envSecret?.length ?? 0,
    hasEnv: Boolean(envSecret),
    equals: got === envSecret,
  });
}
