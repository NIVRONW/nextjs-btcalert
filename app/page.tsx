"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "loading" | "ok" | "error";
type Action = "BUY" | "SELL" | "NONE";

type SignalPayload = {
  at: number;
  verdict: boolean;
  action: Action;
  score: number;
  price: number;
  rsi14: number;
  ema50: number;
  ema200: number;
  change1h?: number;
  change24h?: number;
  rebound2h?: number;
  reason?: string[];
};

type Candle = { t: number; o: number; h: number; l: number; c: number };

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatPct(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatDT(ms: number) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function headlineFromAction(action: Action) {
  if (action === "SELL") return "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴";
  if (action === "BUY") return "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";
  return "🟡 Sin señal clara";
}

function sublineFromAction(action: Action) {
  if (action === "SELL") return "Posible toma de ganancia / salida. Revisa confirmación antes de operar.";
  if (action === "BUY") return "El mercado muestra condiciones favorables. Revisa confirmación antes de operar.";
  return "El mercado no muestra una oportunidad sólida ahora mismo.";
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

/** Candles SVG (sin librerías) */
function CandlesChart({
  candles,
  height = 260,
}: {
  candles: Candle[];
  height?: number;
}) {
  const width = 980; // viewBox width (escala responsive por CSS)

  const { minP, maxP } = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const c of candles) {
      if (Number.isFinite(c.l)) min = Math.min(min, c.l);
      if (Number.isFinite(c.h)) max = Math.max(max, c.h);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = 0;
      max = 1;
    }
    return { minP: min, maxP: max };
  }, [candles]);

  const padTop = 14;
  const padBottom = 18;
  const usableH = height - padTop - padBottom;

  const xStep = candles.length > 1 ? width / candles.length : width;
  const wickW = Math.max(1, Math.floor(xStep * 0.10));
  const bodyW = Math.max(2, Math.floor(xStep * 0.45));

  const y = (p: number) => {
    const t = (p - minP) / (maxP - minP);
    return padTop + (1 - t) * usableH;
  };

  // grid lines
  const gridLines = 5;
  const grid = Array.from({ length: gridLines }, (_, i) => {
    const yy = padTop + (usableH * i) / (gridLines - 1);
    return yy;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    >
      {/* background */}
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1222" />
          <stop offset="1" stopColor="#070b14" />
        </linearGradient>

        <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,196,92,0.0)" />
          <stop offset="0.35" stopColor="rgba(255,196,92,0.55)" />
          <stop offset="0.5" stopColor="rgba(255,214,120,0.85)" />
          <stop offset="0.65" stopColor="rgba(255,196,92,0.55)" />
          <stop offset="1" stopColor="rgba(255,196,92,0.0)" />
        </linearGradient>

        <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="url(#bgGrad)" />

      {/* horizontal grid */}
      {grid.map((yy, idx) => (
        <line
          key={idx}
          x1="0"
          x2={width}
          y1={yy}
          y2={yy}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}

      {/* candles */}
      {candles.map((c, i) => {
        const cx = i * xStep + xStep * 0.5;

        const yH = y(c.h);
        const yL = y(c.l);
        const yO = y(c.o);
        const yC = y(c.c);

        const up = c.c >= c.o;
        const color = up ? "#22c55e" : "#ef4444";

        const bodyTop = Math.min(yO, yC);
        const bodyBottom = Math.max(yO, yC);
        const bodyH = Math.max(2, bodyBottom - bodyTop);

        return (
          <g key={c.t}>
            {/* wick */}
            <line
              x1={cx}
              x2={cx}
              y1={yH}
              y2={yL}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={wickW}
              strokeLinecap="round"
            />
            {/* body */}
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              rx={2}
              fill={color}
              opacity={0.95}
            />
          </g>
        );
      })}

      {/* bottom gold frame (subtle) */}
      <rect
        x="8"
        y="8"
        width={width - 16}
        height={height - 16}
        rx="14"
        fill="none"
        stroke="rgba(255,196,92,0.22)"
        strokeWidth="2"
      />
      <line
        x1="0"
        x2={width}
        y1="6"
        y2="6"
        stroke="url(#goldLine)"
        strokeWidth="3"
        filter="url(#softGlow)"
      />
      <line
        x1="0"
        x2={width}
        y1={height - 6}
        y2={height - 6}
        stroke="url(#goldLine)"
        strokeWidth="3"
        filter="url(#softGlow)"
      />
    </svg>
  );
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesError, setCandlesError] = useState<string>("");

  const scoreBar = useMemo(() => clamp(signal?.score ?? 0, 0, 100), [signal]);

  const theme = useMemo(() => {
    const action = signal?.action ?? "NONE";
    if (action === "BUY") {
      return {
        dot: "#22c55e",
        headline: "#86efac",
        border: "rgba(34,197,94,0.18)",
      };
    }
    if (action === "SELL") {
      return {
        dot: "#ef4444",
        headline: "#fca5a5",
        border: "rgba(239,68,68,0.18)",
      };
    }
    return {
      dot: "#facc15",
      headline: "#fde68a",
      border: "rgba(250,204,21,0.18)",
    };
  }, [signal]);

  async function loadSignal() {
    try {
      setStatus((s) => (s === "ok" ? "ok" : "loading"));
      const s = await fetchJSON("/api/signal");
      setSignal(s?.lastSignal ?? null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles() {
    try {
      setCandlesStatus((s) => (s === "ok" ? "ok" : "loading"));
      setCandlesError("");
      // cache-buster
      const u = `/api/candles?limit=72&v=${crypto?.randomUUID?.() ?? String(Date.now())}`;
      const c = await fetchJSON(u);

      const arr: Candle[] = Array.isArray(c?.candles) ? c.candles : [];
      const clean = arr
        .map((x: any) => ({
          t: Number(x.t),
          o: Number(x.o),
          h: Number(x.h),
          l: Number(x.l),
          c: Number(x.c),
        }))
        .filter(
          (x) =>
            Number.isFinite(x.t) &&
            Number.isFinite(x.o) &&
            Number.isFinite(x.h) &&
            Number.isFinite(x.l) &&
            Number.isFinite(x.c)
        );

      if (clean.length < 24) {
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }

      setCandles(clean);
      setCandlesStatus("ok");
    } catch (e: any) {
      setCandles([]);
      setCandlesStatus("error");
      setCandlesError(e?.message ?? "Error cargando velas");
    }
  }

  useEffect(() => {
    loadSignal();
    loadCandles();

    const id = setInterval(() => {
      loadSignal();
      loadCandles();
    }, 60_000);

    return () => clearInterval(id);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 22,
        background: "#070b12",
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* top glow / hero light */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 380px at 55% 0%, rgba(255,196,92,0.38), rgba(0,0,0,0) 60%), radial-gradient(900px 450px at 30% 15%, rgba(120,180,255,0.18), rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
        {/* HEADER */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              letterSpacing: 1,
              fontWeight: 900,
              fontSize: 32,
              textTransform: "uppercase",
              textShadow: "0 1px 18px rgba(255,196,92,0.18)",
            }}
          >
            <span style={{ color: "#fbbf24" }}>₿ BTCALERT</span>
            <span style={{ color: "rgba(255,255,255,0.55)" }}>—</span>
            {/* ✅ AQUÍ ES DONDE VAMOS A CAMBIAR EL COLOR: */}
            <span style={{ color: "#fbbf24" }}>MONITOREO Y ALERTA DE INVERSION</span>
          </div>

          {/* thin gold line */}
          <div
            style={{
              height: 2,
              marginTop: 10,
              background:
                "linear-gradient(90deg, rgba(255,196,92,0) 0%, rgba(255,196,92,0.85) 50%, rgba(255,196,92,0) 100%)",
              filter: "drop-shadow(0 0 10px rgba(255,196,92,0.28))",
              opacity: 0.9,
            }}
          />
        </div>

        {/* MAIN CARD */}
        <div
          style={{
            borderRadius: 26,
            padding: 26,
            background:
              "radial-gradient(1200px 520px at 20% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 55%), linear-gradient(180deg, rgba(15,23,42,0.88), rgba(8,12,22,0.88))",
            border: `1px solid ${theme.border}`,
            boxShadow:
              "0 18px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
            position: "relative",
          }}
        >
          {/* RIGHT SIDE BRAND AREA */}
          <div
            style={{
              position: "absolute",
              right: 22,
              top: 22,
              textAlign: "right",
              opacity: 0.92,
            }}
          >
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", fontWeight: 700 }}>
              Última actualización
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
              {signal?.at ? formatDT(signal.at) : "—"}
            </div>

            <div style={{ height: 18 }} />

            {/* LOGOS (ponlos en /public) */}
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>
              Developed by
            </div>
            <div style={{ marginTop: 8 }}>
              {/* ✅ PON ESTE ARCHIVO: /public/ndigital.png */}
              <img
                src="/ndigital.png"
                alt="N Digital"
                style={{
                  width: 150,
                  height: "auto",
                  filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.55))",
                }}
                onError={(e) => {
                  // si no existe, ocultamos para no romper el layout
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            <div style={{ height: 16 }} />

            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>
              Powered by
            </div>
            <div style={{ marginTop: 8, fontWeight: 900, letterSpacing: 0.6 }}>
              <span style={{ color: "rgba(255,255,255,0.95)" }}>CHATGPT</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
              OpenAI
            </div>
          </div>

          {/* TOP BADGE */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: theme.dot,
                boxShadow: `0 0 16px ${theme.dot}`,
                display: "inline-block",
              }}
            />
            <div style={{ fontWeight: 900, fontSize: 22, color: theme.headline }}>
              {headlineFromAction(signal?.action ?? "NONE")}
            </div>
          </div>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.65)", maxWidth: 760 }}>
            {sublineFromAction(signal?.action ?? "NONE")}
          </div>

          {/* PRICE */}
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 950,
                lineHeight: 1,
                letterSpacing: 0.2,
                background:
                  "linear-gradient(180deg, rgba(255,220,145,1) 0%, rgba(255,196,92,1) 45%, rgba(210,150,55,1) 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                textShadow: "0 10px 40px rgba(0,0,0,0.55)",
                display: "inline-block",
              }}
            >
              {signal?.price ? formatUSD(signal.price) : "—"}
            </div>
          </div>

          {/* SCORE */}
          <div style={{ marginTop: 22, maxWidth: 980 }}>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", fontWeight: 800 }}>
              Score
            </div>
            <div style={{ fontSize: 36, fontWeight: 950, marginTop: 4 }}>
              {signal ? `${signal.score}/100` : "—"}
            </div>

            <div
              style={{
                height: 12,
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
                marginTop: 10,
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${scoreBar}%`,
                  background:
                    scoreBar >= 75
                      ? "#22c55e"
                      : scoreBar >= 50
                      ? "#fbbf24"
                      : "#ef4444",
                  filter: "drop-shadow(0 0 12px rgba(255,255,255,0.15))",
                }}
              />
            </div>
          </div>

          {/* METRICS ROW */}
          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr 1fr 0.9fr",
              gap: 22,
              paddingRight: 240, // reserve space for right brand area
            }}
          >
            <div>
              <div style={{ opacity: 0.7, fontWeight: 800 }}>RSI (14)</div>
              <div style={{ fontWeight: 950, fontSize: 30, marginTop: 2 }}>
                {signal ? signal.rsi14.toFixed(2) : "—"}
              </div>
              <div style={{ marginTop: 6, opacity: 0.65, fontWeight: 700 }}>
                1h: {formatPct(signal?.change1h)} • 24h: {formatPct(signal?.change24h)}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7, fontWeight: 800 }}>EMA 50</div>
              <div style={{ fontWeight: 950, fontSize: 30, marginTop: 2 }}>
                {signal ? formatUSD(signal.ema50) : "—"}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7, fontWeight: 800 }}>EMA 200</div>
              <div style={{ fontWeight: 950, fontSize: 30, marginTop: 2 }}>
                {signal ? formatUSD(signal.ema200) : "—"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ opacity: 0.7, fontWeight: 800 }}>Rebote 2h</div>
              <div style={{ fontWeight: 950, fontSize: 30, marginTop: 2 }}>
                {formatPct(signal?.rebound2h)}
              </div>
            </div>
          </div>

          {/* CANDLES SECTION */}
          <div style={{ marginTop: 22, paddingRight: 240 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "rgba(255,255,255,0.88)" }}>
              Gráfico de velas (últimas 72 horas)
            </div>

            <div
              style={{
                marginTop: 12,
                borderRadius: 20,
                padding: 14,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.30))",
                border: "1px solid rgba(255,196,92,0.16)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ height: 320 }}>
                {candlesStatus === "loading" && (
                  <div style={{ opacity: 0.7, fontWeight: 700 }}>Cargando velas...</div>
                )}

                {candlesStatus === "error" && (
                  <div style={{ color: "#fca5a5", fontWeight: 800 }}>
                    No se pudieron cargar las velas desde /api/candles.
                    <div style={{ marginTop: 6, opacity: 0.9, fontWeight: 700 }}>
                      Detalle: {candlesError}
                    </div>
                  </div>
                )}

                {candlesStatus === "ok" && candles.length > 0 && (
                  <CandlesChart candles={candles} height={320} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* tiny status (optional) */}
        <div style={{ marginTop: 14, opacity: 0.6, fontWeight: 700 }}>
          {status === "loading" && "Cargando señal..."}
          {status === "error" && "Error cargando señal."}
          {status === "ok" && "Listo."}
        </div>
      </div>
    </main>
  );
}
