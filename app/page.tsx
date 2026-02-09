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

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function subtitleFromAction(action: Action) {
  if (action === "BUY") return "Oportunidad detectada: COMPRA";
  if (action === "SELL") return "Oportunidad detectada: VENTA";
  return "El mercado no muestra una oportunidad sólida ahora mismo.";
}

function badgeFromAction(action: Action) {
  if (action === "BUY") return { text: "🟢 Señal de compra", dot: "#22c55e" };
  if (action === "SELL") return { text: "🔴 Señal de venta", dot: "#ef4444" };
  return { text: "🟡 Sin señal clara", dot: "#facc15" };
}

function actionBg(action: Action) {
  // Fondo sutil por acción (sin destruir el diseño)
  if (action === "BUY") return "radial-gradient(900px 480px at 15% 10%, rgba(34,197,94,.22), rgba(2,6,23,0) 60%)";
  if (action === "SELL") return "radial-gradient(900px 480px at 15% 10%, rgba(239,68,68,.20), rgba(2,6,23,0) 60%)";
  return "radial-gradient(900px 480px at 15% 10%, rgba(250,204,21,.16), rgba(2,6,23,0) 60%)";
}

function CandlesSVG({ candles }: { candles: Candle[] }) {
  // SVG simple y rápido (sin librerías)
  const w = 980;
  const h = 260;
  const padX = 14;
  const padY = 14;

  const xs = candles.map((_, i) => i);
  const lows = candles.map((c) => c.l);
  const highs = candles.map((c) => c.h);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lows);
  const maxY = Math.max(...highs);

  const scaleX = (x: number) => {
    if (maxX === minX) return padX;
    return padX + ((x - minX) / (maxX - minX)) * (w - padX * 2);
  };

  const scaleY = (y: number) => {
    if (maxY === minY) return h / 2;
    // invertir y
    return padY + (1 - (y - minY) / (maxY - minY)) * (h - padY * 2);
  };

  const bodyW = Math.max(3, Math.min(10, (w - padX * 2) / Math.max(1, candles.length) * 0.6));

  // grid horizontal
  const gridLines = 5;
  const grid = Array.from({ length: gridLines }, (_, i) => {
    const y = padY + (i / (gridLines - 1)) * (h - padY * 2);
    return (
      <line
        key={i}
        x1={padX}
        x2={w - padX}
        y1={y}
        y2={y}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />
    );
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    >
      {grid}

      {candles.map((c, i) => {
        const x = scaleX(i);
        const yH = scaleY(c.h);
        const yL = scaleY(c.l);
        const yO = scaleY(c.o);
        const yC = scaleY(c.c);

        const up = c.c >= c.o;
        const color = up ? "#22c55e" : "#ef4444";
        const wick = "rgba(255,255,255,0.25)";

        const top = Math.min(yO, yC);
        const bot = Math.max(yO, yC);
        const bodyH = Math.max(2, bot - top);

        return (
          <g key={c.t}>
            {/* wick */}
            <line
              x1={x}
              x2={x}
              y1={yH}
              y2={yL}
              stroke={wick}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* body */}
            <rect
              x={x - bodyW / 2}
              y={top}
              width={bodyW}
              height={bodyH}
              rx={2}
              fill={color}
              opacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [cStatus, setCStatus] = useState<Status>("loading");
  const [cError, setCError] = useState<string>("");

  async function loadSignal() {
    try {
      setStatus("loading");
      const s = await fetchJSON(`/api/signal?v=${Date.now()}`);
      setSignal(s?.lastSignal ?? null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles(limit = 72) {
    try {
      setCStatus("loading");
      setCError("");
      const c = await fetchJSON(`/api/candles?limit=${limit}&v=${Date.now()}`);
      const arr: Candle[] = Array.isArray(c?.candles) ? c.candles : [];
      if (arr.length < 20) throw new Error("No llegaron velas suficientes");
      setCandles(arr);
      setCStatus("ok");
    } catch (e: any) {
      setCStatus("error");
      setCError(e?.message || "candles_error");
      setCandles([]);
    }
  }

  useEffect(() => {
    loadSignal();
    loadCandles(72);
    const id = setInterval(() => {
      loadSignal();
      loadCandles(72);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;
  const action: Action = signal?.action ?? "NONE";
  const badge = badgeFromAction(action);

  const bg = useMemo(() => actionBg(action), [action]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: "#050914",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      {/* glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: bg,
          filter: "blur(6px)",
        }}
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
        {/* HEADER: 2 líneas, centrado SIEMPRE */}
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              fontWeight: 950,
              letterSpacing: 0.5,
              fontSize: "clamp(22px, 4vw, 36px)",
              lineHeight: 1.05,
              color: "#fbbf24",
              textShadow: "0 10px 30px rgba(0,0,0,.55)",
            }}
          >
            ₿ BTCALERT
          </div>
          <div
            style={{
              marginTop: 6,
              fontWeight: 900,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontSize: "clamp(12px, 2.2vw, 18px)",
              lineHeight: 1.1,
              color: "#fbbf24", // MISMO DORADO
              opacity: 0.92,
              textShadow: "0 10px 30px rgba(0,0,0,.55)",
            }}
          >
            MONITOREO Y ALERTA DE INVERSION
          </div>
        </header>

        {status === "loading" && <p style={{ opacity: 0.8 }}>Cargando datos…</p>}
        {status === "error" && <p style={{ color: "#f87171" }}>Error cargando señal.</p>}

        {signal && (
          <section
            style={{
              borderRadius: 24,
              padding: 26,
              background: "rgba(2,6,23,.72)",
              border: "1px solid rgba(148,163,184,.18)",
              boxShadow: "0 30px 80px rgba(0,0,0,.45)",
              backdropFilter: "blur(10px)",
            }}
          >
            {/* top row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: badge.dot,
                    boxShadow: `0 0 22px ${badge.dot}`,
                    display: "inline-block",
                  }}
                />
                <div style={{ fontWeight: 900, fontSize: 20, color: "#fbbf24" }}>
                  {badge.text.replace("🟡 ", "").replace("🟢 ", "").replace("🔴 ", "")}
                </div>
              </div>

              <div style={{ textAlign: "right", opacity: 0.8, fontWeight: 700 }}>
                <div>Última actualización</div>
                <div>
                  {new Date(signal.at).toLocaleString("en-US", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, opacity: 0.75 }}>{subtitleFromAction(action)}</div>

            {/* price */}
            <div
              style={{
                marginTop: 18,
                fontSize: "clamp(38px, 5.5vw, 70px)",
                fontWeight: 950,
                letterSpacing: 0.2,
                textShadow: "0 18px 60px rgba(0,0,0,.55)",
              }}
            >
              {formatUSD(signal.price)}
            </div>

            {/* score */}
            <div style={{ marginTop: 18 }}>
              <div style={{ opacity: 0.75, marginBottom: 6 }}>Score</div>
              <div style={{ fontWeight: 950, fontSize: 34 }}>
                {signal.score}/100
              </div>

              <div
                style={{
                  marginTop: 10,
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.08)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${scoreBar}%`,
                    background:
                      scoreBar >= 80 ? "#22c55e" : scoreBar >= 50 ? "#fbbf24" : "#ef4444",
                  }}
                />
              </div>
            </div>

            {/* metrics row */}
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 22,
              }}
            >
              <div>
                <div style={{ opacity: 0.65 }}>RSI (14)</div>
                <div style={{ fontWeight: 950, fontSize: 28 }}>{signal.rsi14.toFixed(2)}</div>
                <div style={{ marginTop: 4, opacity: 0.7 }}>
                  1h: {formatPct(signal.change1h)} · 24h: {formatPct(signal.change24h)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.65 }}>EMA 50</div>
                <div style={{ fontWeight: 950, fontSize: 28 }}>{formatUSD(signal.ema50)}</div>
              </div>

              <div>
                <div style={{ opacity: 0.65 }}>EMA 200</div>
                <div style={{ fontWeight: 950, fontSize: 28 }}>{formatUSD(signal.ema200)}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ opacity: 0.65 }}>Rebote 2h</div>
                <div style={{ fontWeight: 950, fontSize: 28 }}>
                  {typeof signal.rebound2h === "number" ? formatPct(signal.rebound2h) : "—"}
                </div>
              </div>
            </div>

            {/* candles */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontWeight: 900, opacity: 0.85, marginBottom: 10 }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              <div
                style={{
                  height: 310,
                  borderRadius: 18,
                  background: "rgba(0,0,0,.20)",
                  border: "1px solid rgba(255,255,255,.10)",
                  overflow: "hidden",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,.04)",
                }}
              >
                {cStatus === "loading" && (
                  <div style={{ padding: 14, opacity: 0.8 }}>Cargando velas…</div>
                )}

                {cStatus === "error" && (
                  <div style={{ padding: 14, color: "#f87171" }}>
                    No se pudieron cargar las velas desde <b>/api/candles</b>.
                    <div style={{ marginTop: 6, opacity: 0.9 }}>Detalle: {cError}</div>
                  </div>
                )}

                {cStatus === "ok" && candles.length > 0 && (
                  <div style={{ width: "100%", height: "100%", padding: 10 }}>
                    <CandlesSVG candles={candles} />
                  </div>
                )}
              </div>
            </div>

            {/* responsive tweak */}
            <style>{`
              @media (max-width: 900px) {
                section { padding: 18px !important; }
              }
              @media (max-width: 820px) {
                .metrics4 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
              }
            `}</style>
          </section>
        )}
      </div>
    </main>
  );
}
