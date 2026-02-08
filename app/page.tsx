"use client";

import { useEffect, useMemo, useState } from "react";

type Action = "BUY" | "SELL" | "NONE";
type Status = "loading" | "ok" | "error";

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

function fmtPct(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatDT(ms: number) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function bgFromAction(action: Action) {
  if (action === "BUY") return "radial-gradient(1200px 600px at 50% -10%, rgba(34,197,94,.18), rgba(11,15,25,1) 55%)";
  if (action === "SELL") return "radial-gradient(1200px 600px at 50% -10%, rgba(239,68,68,.18), rgba(11,15,25,1) 55%)";
  return "radial-gradient(1200px 600px at 50% -10%, rgba(245,158,11,.14), rgba(11,15,25,1) 55%)";
}

function titleRow(action: Action) {
  if (action === "BUY") return { dot: "🟢", title: "ES BUENA OPORTUNIDAD PARA COMPRAR" };
  if (action === "SELL") return { dot: "🔴", title: "ES BUENA OPORTUNIDAD PARA VENDER" };
  return { dot: "🟡", title: "Sin señal clara" };
}

function CandleChart({ candles }: { candles: Candle[] }) {
  // SVG simple, sin librerías
  const W = 920;
  const H = 260;
  const PAD_X = 18;
  const PAD_Y = 18;

  const data = candles ?? [];
  if (!data.length) return null;

  const minL = Math.min(...data.map((d) => d.l));
  const maxH = Math.max(...data.map((d) => d.h));
  const range = Math.max(1e-9, maxH - minL);

  const xStep = (W - PAD_X * 2) / Math.max(1, data.length - 1);

  const y = (price: number) =>
    PAD_Y + (1 - (price - minL) / range) * (H - PAD_Y * 2);

  const bodyW = Math.max(3, Math.min(10, xStep * 0.55));

  // grid lines
  const grid = Array.from({ length: 5 }).map((_, i) => {
    const yy = PAD_Y + (i / 4) * (H - PAD_Y * 2);
    return (
      <line
        key={i}
        x1={PAD_X}
        x2={W - PAD_X}
        y1={yy}
        y2={yy}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />
    );
  });

  const bars = data.map((d, i) => {
    const cx = PAD_X + i * xStep;
    const yO = y(d.o);
    const yC = y(d.c);
    const yH = y(d.h);
    const yL = y(d.l);

    const up = d.c >= d.o;
    const color = up ? "#22c55e" : "#ef4444";
    const top = Math.min(yO, yC);
    const bot = Math.max(yO, yC);
    const hBody = Math.max(2, bot - top);

    return (
      <g key={i}>
        {/* wick */}
        <line x1={cx} x2={cx} y1={yH} y2={yL} stroke="rgba(255,255,255,0.30)" strokeWidth="1" />
        {/* body */}
        <rect
          x={cx - bodyW / 2}
          y={top}
          width={bodyW}
          height={hBody}
          rx="1.5"
          fill={color}
          opacity="0.95"
        />
      </g>
    );
  });

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.18)",
        padding: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: "100%",
            height: 240,
            display: "block",
          }}
        >
          {grid}
          {bars}
        </svg>
      </div>
    </div>
  );
}

export default function Page() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesError, setCandlesError] = useState<string>("");

  async function loadSignal() {
    try {
      setStatus("loading");
      const s = await fetchJSON("/api/signal");
      setSignal(s?.lastSignal ?? null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles() {
    try {
      setCandlesStatus("loading");
      setCandlesError("");
      const c = await fetchJSON("/api/candles?limit=72");
      const arr = (c?.candles ?? []) as Candle[];
      if (!Array.isArray(arr) || arr.length < 10) {
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }
      setCandles(arr);
      setCandlesStatus("ok");
    } catch (e: any) {
      setCandles([]);
      setCandlesStatus("error");
      setCandlesError(e?.message || "Error cargando velas");
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

  const action: Action = signal?.action ?? "NONE";
  const row = titleRow(action);

  const score = signal?.score ?? 0;
  const scoreBar = clamp(score, 0, 100);

  const gold = "#f5b301"; // dorado fuerte para el header
  const softText = "rgba(255,255,255,0.68)";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        background: bgFromAction(action),
        color: "#e5e7eb",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* HEADER NUEVO: 2 líneas centradas */}
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: 0.5,
                color: gold,
                textShadow: "0 10px 30px rgba(0,0,0,.35)",
              }}
            >
              ₿ BTCALERT
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: gold, // 👈 MISMO DORADO (ya no gris)
                opacity: 0.95,
              }}
            >
              MONITOREO Y ALERTA DE INVERSION
            </div>
          </div>
        </header>

        {/* estados */}
        {status === "loading" && <p style={{ opacity: 0.8 }}>Cargando datos...</p>}
        {status === "error" && <p style={{ color: "#f87171" }}>Error cargando señal.</p>}

        {signal && (
          <section
            style={{
              borderRadius: 26,
              padding: 22,
              background: "rgba(15,23,42,0.70)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* header tarjeta */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14 }}>{row.dot}</span>
                  <div style={{ fontWeight: 900, fontSize: 18, color: gold }}>
                    {row.title}
                  </div>
                </div>
                <div style={{ marginTop: 8, color: softText, fontSize: 13 }}>
                  {action === "NONE"
                    ? "El mercado no muestra una oportunidad sólida ahora mismo."
                    : "Se detectó una señal relevante según los indicadores."}
                </div>
              </div>

              <div style={{ textAlign: "right", color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Última actualización</div>
                <div style={{ fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>
                  {formatDT(signal.at)}
                </div>
              </div>
            </div>

            {/* precio */}
            <div
              style={{
                marginTop: 18,
                fontSize: 64,
                fontWeight: 950,
                letterSpacing: -0.5,
                lineHeight: 1.05,
              }}
            >
              {formatUSD(signal.price)}
            </div>

            {/* score */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)" }}>Score</div>
              <div style={{ fontSize: 30, fontWeight: 950, marginTop: 2 }}>
                {signal.score}/100
              </div>

              <div
                style={{
                  height: 10,
                  marginTop: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${scoreBar}%`,
                    background:
                      scoreBar >= 75 ? "#22c55e" : scoreBar >= 50 ? "#fbbf24" : "#ef4444",
                  }}
                />
              </div>
            </div>

            {/* métricas */}
            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>RSI (14)</div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>
                  {signal.rsi14.toFixed(2)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  1h: {fmtPct(signal.change1h)} · 24h: {fmtPct(signal.change24h)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>EMA 50</div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>
                  {formatUSD(signal.ema50)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>EMA 200</div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>
                  {formatUSD(signal.ema200)}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Rebote 2h</div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 3 }}>
                  {fmtPct(signal.rebound2h)}
                </div>
              </div>
            </div>

            {/* velas */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.80)" }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              {candlesStatus === "loading" && (
                <div style={{ marginTop: 10, color: "rgba(255,255,255,0.6)" }}>
                  Cargando velas...
                </div>
              )}

              {candlesStatus === "error" && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(239,68,68,0.35)",
                    background: "rgba(239,68,68,0.08)",
                    color: "#fca5a5",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  No se pudieron cargar las velas desde /api/candles.
                  {"\n"}Detalle: {candlesError}
                </div>
              )}

              {candlesStatus === "ok" && <CandleChart candles={candles} />}
            </div>
          </section>
        )}

        {/* responsive: en móvil, bajamos tamaño del header */}
        <style jsx global>{`
          @media (max-width: 720px) {
            header div:first-child > div:first-child {
              font-size: 24px !important;
            }
            header div:first-child > div:last-child {
              font-size: 14px !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
