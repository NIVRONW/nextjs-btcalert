export async function GET() {
  return Response.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
  });
}

