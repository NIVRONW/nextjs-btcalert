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

function headlineFromAction(action: Action) {
  if (action === "SELL") return "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴";
  if (action === "BUY") return "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";
  return "🟡 Sin señal clara";
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

function pickBg(action: Action) {
  if (action === "BUY") return "radial-gradient(1200px 500px at 10% 0%, rgba(34,197,94,.22), rgba(11,15,25,1))";
  if (action === "SELL") return "radial-gradient(1200px 500px at 10% 0%, rgba(239,68,68,.20), rgba(11,15,25,1))";
  return "radial-gradient(1200px 500px at 10% 0%, rgba(250,204,21,.16), rgba(11,15,25,1))";
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [updatedAt, setUpdatedAt] = useState<string>("");

  // Velas
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesErr, setCandlesErr] = useState<string>("");

  async function loadAll() {
    try {
      setStatus("loading");

      const s = await fetchJSON("/api/signal");
      const sig = (s?.lastSignal ?? null) as SignalPayload | null;
      setSignal(sig);

      setUpdatedAt(new Date().toLocaleString());
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles() {
    try {
      setCandlesStatus("loading");
      setCandlesErr("");

      const c = await fetchJSON("/api/candles?limit=72");
      const arr = (c?.candles ?? []) as Candle[];

      if (!Array.isArray(arr) || arr.length < 10) {
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }

      setCandles(
        arr
          .map((x) => ({
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
          )
      );

      setCandlesStatus("ok");
    } catch (e: any) {
      setCandlesStatus("error");
      setCandlesErr(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    loadAll();
    loadCandles();

    const id = setInterval(() => {
      loadAll();
      loadCandles();
    }, 60_000);

    return () => clearInterval(id);
  }, []);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;

  // ====== Gráfico de velas (SVG) ======
  const candleSVG = useMemo(() => {
    if (!candles.length) return null;

    const W = 900;
    const H = 260;
    const padX = 10;
    const padY = 12;

    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);

    const minY = Math.min(...lows);
    const maxY = Math.max(...highs);
    const range = Math.max(1e-9, maxY - minY);

    const scaleY = (v: number) =>
      H - padY - ((v - minY) / range) * (H - padY * 2);

    const n = candles.length;
    const step = (W - padX * 2) / Math.max(1, n);
    const bodyW = Math.max(3, Math.min(10, step * 0.6));

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* grid sutil */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = padY + ((H - padY * 2) * i) / 4;
          return (
            <line
              key={i}
              x1={padX}
              x2={W - padX}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}

        {candles.map((c, i) => {
          const xCenter = padX + step * i + step / 2;

          const yH = scaleY(c.h);
          const yL = scaleY(c.l);
          const yO = scaleY(c.o);
          const yC = scaleY(c.c);

          const up = c.c >= c.o;

          const top = Math.min(yO, yC);
          const bot = Math.max(yO, yC);
          const bodyH = Math.max(2, bot - top);

          const wickColor = "rgba(255,255,255,0.45)";
          const bodyColor = up ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";

          return (
            <g key={c.t}>
              {/* wick */}
              <line
                x1={xCenter}
                x2={xCenter}
                y1={yH}
                y2={yL}
                stroke={wickColor}
                strokeWidth="1"
              />

              {/* body */}
              <rect
                x={xCenter - bodyW / 2}
                y={top}
                width={bodyW}
                height={bodyH}
                fill={bodyColor}
                rx="2"
              />
            </g>
          );
        })}
      </svg>
    );
  }, [candles]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: signal ? pickBg(signal.action) : "#0b0f19",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <h1
  style={{
    fontSize: 28,
    marginBottom: 20,
    fontWeight: 900,
    background: "linear-gradient(90deg,#22d3ee,#4ade80)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  }}
>
  ₿ BTCALERT – MONITOREO Y ALERTA DE INVERSION
</h1>

        {status === "loading" && <p>Cargando datos...</p>}
        {status === "error" && <p style={{ color: "#fca5a5" }}>Error cargando señal.</p>}

        {signal && (
          <div
            style={{
              borderRadius: 18,
              padding: 22,
              background: "rgba(15,23,42,0.75)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
              backdropFilter: "blur(10px)",
            }}
          >
            {/* TITULO */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 18,
                  marginBottom: 10,
                  color:
                    signal.action === "SELL"
                      ? "#f87171"
                      : signal.action === "BUY"
                      ? "#4ade80"
                      : "#facc15",
                }}
              >
                {headlineFromAction(signal.action)}
              </div>

              <div style={{ opacity: 0.75, fontSize: 12 }}>
                Última actualización
                <div style={{ fontWeight: 800, opacity: 0.95 }}>{updatedAt}</div>
              </div>
            </div>

            {/* PRECIO GRANDE */}
            <div style={{ fontSize: 48, fontWeight: 950, letterSpacing: -0.8 }}>
              {formatUSD(signal.price)}
            </div>

            {/* SCORE BAR */}
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 6, opacity: 0.95 }}>
                Score: <b>{signal.score}/100</b>
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
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
                  }}
                />
              </div>
            </div>

            {/* INDICADORES LIMPIOS */}
            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <div style={{ opacity: 0.7 }}>RSI (14)</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {signal.rsi14.toFixed(2)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 50</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {formatUSD(signal.ema50)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 200</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {formatUSD(signal.ema200)}
                </div>
              </div>
            </div>

            {/* ====== VELAS ====== */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.9, marginBottom: 10 }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              <div
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(11,18,32,0.6)",
                  padding: 12,
                }}
              >
                {candlesStatus === "loading" && (
                  <div style={{ opacity: 0.75 }}>Cargando velas…</div>
                )}

                {candlesStatus === "error" && (
                  <div style={{ color: "#fca5a5", fontSize: 12, whiteSpace: "pre-wrap" }}>
                    No se pudieron cargar las velas desde <b>/api/candles</b>.
                    {"\n"}
                    Detalle: {candlesErr || "Sin detalle"}
                  </div>
                )}

                {candlesStatus === "ok" && candleSVG}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
