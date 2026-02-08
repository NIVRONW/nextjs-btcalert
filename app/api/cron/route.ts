const url = new URL(req.url);

const expected = (process.env.CRON_SECRET || "").trim();

// lee secreto desde 3 fuentes
const fromHeader = (req.headers.get("x-cron-secret") || "").trim();
const fromQuery  = (url.searchParams.get("secret") || "").trim();

const auth = (req.headers.get("authorization") || "").trim();
const fromBearer = auth.toLowerCase().startsWith("bearer ")
  ? auth.slice(7).trim()
  : "";

// elige el primero que venga
const provided = fromHeader || fromQuery || fromBearer;

if (!expected) {
  return NextResponse.json(
    { ok: false, error: "CRON_SECRET missing in env" },
    { status: 500 }
  );
}

if (provided !== expected) {
  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized",
      debug: {
        expectedLen: expected.length,
        providedLen: provided.length,
        hasHeader: Boolean(fromHeader),
        hasQuery: Boolean(fromQuery),
        hasBearer: Boolean(fromBearer),
      },
    },
    { status: 401 }
  );
}
