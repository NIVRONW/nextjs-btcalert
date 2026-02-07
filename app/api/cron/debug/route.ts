export async function GET(req: Request) {
  const url = new URL(req.url);
  const got = url.searchParams.get("secret");

  return Response.json({
    ok: true,
    gotSecret: Boolean(got),
    gotSecretLen: got?.length ?? 0,
    hasCronSecret: Boolean(process.env.CRON_SECRET),
    cronSecretLen: process.env.CRON_SECRET?.length ?? 0,
    equals: got === process.env.CRON_SECRET,
  });
}

