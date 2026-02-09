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
  // opcional si lo tienes:
  // bounce2h?: number;
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
  return "";
}

function badgeFromAction(action: Action) {
  if (action === "SELL") return { dot: "🔴", title: "Señal de VENTA", color: "#fb7185" };
  if (action === "BUY") return { dot: "🟢", title: "Señal de COMPRA", color: "#34d399" };
  return { dot: "🟡", title: "Sin señal clara", color: "#facc15" };
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function CandleChart({ candles }: { candles: Candle[] }) {
  const w = 900;
  const h = 260;
  const pad = 16;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const ys = useMemo(() => candles.flatMap((c) => [c.h, c.l]), [candles]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const xStep = plotW / Math.max(1, candles.length);
  const candleW = Math.max(3, Math.min(10, xStep * 0.55));

  const y = (v: number) => {
    if (maxY === minY) return pad + plotH / 2;
    const t = (v - minY) / (maxY - minY);
    return pad + (1 - t) * plotH;
  };

  // grid lines
  const grid = 4;
  const gridYs = Array.from({ length: grid + 1 }, (_, i) => pad + (plotH * i) / grid);

  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(0,0,0,.20)",
        padding: 14,
        overflow: "hidden",
      }}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="260"
        style={{ display: "block" }}
      >
        {/* grid */}
        {gridYs.map((gy, i) => (
          <line
            key={i}
            x1={pad}
            x2={w - pad}
            y1={gy}
            y2={gy}
            stroke="rgba(255,255,255,.06)"
            strokeWidth="1"
          />
        ))}

        {/* candles */}
        {candles.map((c, i) => {
          const cx = pad + i * xStep + xStep / 2;
          const up = c.c >= c.o;
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyBot = y(Math.min(c.o, c.c));
          const wickTop = y(c.h);
          const wickBot = y(c.l);

          const bodyH = Math.max(2, bodyBot - bodyTop);
          const fill = up ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
          const wick = up ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)";

          return (
            <g key={c.t}>
              <line
                x1={cx}
                x2={cx}
                y1={wickTop}
                y2={wickBot}
                stroke={wick}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <rect
                x={cx - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                rx="2"
                fill={fill}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [candleErr, setCandleErr] = useState<string>("");

  const DEPLOY_MARKER = "DEPLOY-2026-02-09-A"; // cambia esto si quieres verificar despliegue

  async function loadAll() {
    try {
      setStatus("loading");

      const s = await fetchJSON(`/api/signal?v=${crypto.randomUUID()}`);
      const last = (s?.lastSignal ?? null) as SignalPayload | null;
      setSignal(last);

      try {
        const c = await fetchJSON(`/api/candles?limit=72&v=${crypto.randomUUID()}`);
        const list = (c?.candles ?? []) as Candle[];
        if (!Array.isArray(list) || list.length < 10) {
          throw new Error("No llegaron velas suficientes desde /api/candles");
        }
        setCandles(list);
        setCandleErr("");
      } catch (e: any) {
        setCandles([]);
        setCandleErr(e?.message ?? "No se pudieron cargar las velas.");
      }

      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => clearInterval(id);
  }, []);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;
  const action: Action = signal?.action ?? "NONE";

  const badge = badgeFromAction(action);

  // background por señal
  const bg =
    action === "BUY"
      ? "radial-gradient(1200px 500px at 20% 0%, rgba(34,197,94,.20), transparent 65%), #0b0f19"
      : action === "SELL"
      ? "radial-gradient(1200px 500px at 20% 0%, rgba(239,68,68,.18), transparent 65%), #0b0f19"
      : "radial-gradient(1200px 500px at 20% 0%, rgba(250,204,21,.14), transparent 65%), #0b0f19";

  const cardBg =
    "linear-gradient(180deg, rgba(15,23,42,.92), rgba(2,6,23,.92))";

  const updatedAt = signal?.at
    ? new Date(signal.at).toLocaleString()
    : "—";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: bg,
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      {/* DEPLOY MARKER REAL (NO comentario) */}
      <div
        style={{
          position: "fixed",
          bottom: 10,
          left: 10,
          fontSize: 11,
          opacity: 0.55,
          letterSpacing: 0.4,
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,.10)",
          background: "rgba(0,0,0,.25)",
          zIndex: 99,
          userSelect: "none",
        }}
      >
        {DEPLOY_MARKER}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* HEADER 2 líneas CENTRADO (móvil/iPad) */}
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              fontWeight: 950,
              fontSize: 34,
              lineHeight: 1.05,
              letterSpacing: 0.5,
              color: "#fbbf24",
              textTransform: "uppercase",
            }}
          >
            ₿ BTCALERT
          </div>
          <div
            style={{
              marginTop: 6,
              fontWeight: 900,
              fontSize: 22,
              lineHeight: 1.1,
              letterSpacing: 1,
              color: "#fbbf24", // MISMO DORADO
              textTransform: "uppercase",
            }}
          >
            MONITOREO Y ALERTA DE INVERSION
          </div>
        </header>

        {status === "loading" && <p>Cargando datos...</p>}
        {status === "error" && <p>Error cargando señal.</p>}

        {signal && (
          <div
            style={{
              borderRadius: 22,
              padding: 22,
              background: cardBg,
              border: "1px solid rgba(255,255,255,.08)",
              boxShadow: "0 20px 80px rgba(0,0,0,.55)",
            }}
          >
            {/* top row */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, color: badge.color }}>
                  {badge.dot} {badge.title}
                </div>
                <div style={{ opacity: 0.72, marginTop: 6 }}>
                  El mercado no muestra una oportunidad sólida ahora mismo.
                </div>
              </div>

              <div style={{ textAlign: "right", opacity: 0.75 }}>
                <div style={{ fontWeight: 700 }}>Última actualización</div>
                <div style={{ fontWeight: 800 }}>{updatedAt}</div>
              </div>
            </div>

            {/* price */}
            <div style={{ fontSize: 54, fontWeight: 950, marginTop: 10 }}>
              {formatUSD(signal.price)}
            </div>

            {/* score */}
            <div style={{ marginTop: 18 }}>
              <div style={{ opacity: 0.7 }}>Score</div>
              <div style={{ fontSize: 30, fontWeight: 950 }}>
                {signal.score}/100
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.08)",
                  overflow: "hidden",
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${scoreBar}%`,
                    background:
                      scoreBar >= 75
                        ? "rgba(34,197,94,.95)"
                        : scoreBar >= 50
                        ? "rgba(250,204,21,.95)"
                        : "rgba(239,68,68,.95)",
                  }}
                />
              </div>
            </div>

            {/* indicadores */}
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <div style={{ opacity: 0.7 }}>RSI (14)</div>
                <div style={{ fontWeight: 950, fontSize: 26 }}>
                  {signal.rsi14.toFixed(2)}
                </div>
                <div style={{ opacity: 0.55, marginTop: 4, fontSize: 13 }}>
                  {/* si tienes 1h/24h lo puedes conectar luego */}
                  1h: — • 24h: —
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 50</div>
                <div style={{ fontWeight: 950, fontSize: 26 }}>
                  {formatUSD(signal.ema50)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 200</div>
                <div style={{ fontWeight: 950, fontSize: 26 }}>
                  {formatUSD(signal.ema200)}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ opacity: 0.7 }}>Rebote 2h</div>
                <div style={{ fontWeight: 950, fontSize: 26 }}>
                  {/* si luego conectas bounce2h desde /api/signal */}
                  0.00%
                </div>
              </div>
            </div>

            {/* velas */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9 }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              {candleErr ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: "rgba(0,0,0,.18)",
                    color: "#fca5a5",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    No se pudieron cargar las velas desde /api/candles.
                  </div>
                  <div style={{ opacity: 0.9 }}>Detalle: {candleErr}</div>
                </div>
              ) : candles.length ? (
                <CandleChart candles={candles} />
              ) : (
                <div style={{ opacity: 0.7 }}>Cargando velas...</div>
              )}
            </div>

            {/* headline solo si BUY/SELL */}
            {action !== "NONE" && (
              <div
                style={{
                  marginTop: 18,
                  fontWeight: 950,
                  fontSize: 18,
                  color: badge.color,
                }}
              >
                {headlineFromAction(action)}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
