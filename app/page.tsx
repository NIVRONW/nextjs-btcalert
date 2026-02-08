"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  // opcionales (por si tu API los manda)
  change1h?: number;
  change24h?: number;
  rebound2h?: number;
  reason?: string[];
};

type Candle = {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
};

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

function headlineFromAction(action: Action) {
  if (action === "SELL") return "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴";
  if (action === "BUY") return "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";
  return "🟡 Sin señal clara";
}

function sublineFromAction(action: Action) {
  if (action === "SELL") return "El mercado sugiere tomar ganancia o proteger capital.";
  if (action === "BUY") return "El mercado muestra condiciones favorables para entrada.";
  return "El mercado no muestra una oportunidad sólida ahora mismo.";
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function drawCandles(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  theme: { bg: string; grid: string; wick: string; up: string; down: string }
) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  // Ajuste hi-dpi
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Fondo
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  if (!candles.length) return;

  const pad = 18;
  const W = cssW;
  const H = cssH;
  const plotW = W - pad * 2;
  const plotH = H - pad * 2;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);

  const maxY = Math.max(...highs);
  const minY = Math.min(...lows);
  const range = maxY - minY || 1;

  const y = (price: number) => pad + (1 - (price - minY) / range) * plotH;

  // Grid
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const yy = pad + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(pad, yy);
    ctx.lineTo(W - pad, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Candles
  const n = candles.length;
  const step = plotW / n;
  const bodyW = Math.max(2, Math.min(10, step * 0.55));

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const cx = pad + i * step + step / 2;

    const yo = y(c.o);
    const yh = y(c.h);
    const yl = y(c.l);
    const yc = y(c.c);

    const isUp = c.c >= c.o;

    // Wick
    ctx.strokeStyle = theme.wick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, yh);
    ctx.lineTo(cx, yl);
    ctx.stroke();

    // Body
    const top = Math.min(yo, yc);
    const bottom = Math.max(yo, yc);
    const bodyH = Math.max(1.5, bottom - top);

    ctx.fillStyle = isUp ? theme.up : theme.down;
    ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH);
  }
}

export default function Home() {
  // ✅ Confirmación adicional para BUY (frontend)
  // Si action=BUY pero score < BUY_MIN_SCORE => mostramos "Sin señal clara"
  const BUY_MIN_SCORE = 80;

  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesErr, setCandlesErr] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  async function loadCandles(limit = 72) {
    try {
      setCandlesStatus("loading");
      setCandlesErr("");

      // cache-bust para evitar cache raro
      const v = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
      const c = await fetchJSON(`/api/candles?limit=${limit}&v=${encodeURIComponent(v)}`);

      const arr: Candle[] = Array.isArray(c?.candles) ? c.candles : [];
      if (!arr.length || arr.length < Math.min(24, limit)) {
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }

      setCandles(arr);
      setCandlesStatus("ok");
    } catch (e: any) {
      setCandles([]);
      setCandlesStatus("error");
      setCandlesErr(e?.message ?? "No se pudieron cargar las velas");
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

  // Acción “efectiva” con confirmación adicional para BUY
  const effectiveAction: Action = useMemo(() => {
    if (!signal) return "NONE";
    if (signal.action === "BUY" && signal.score < BUY_MIN_SCORE) return "NONE";
    return signal.action;
  }, [signal]);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;

  const theme = useMemo(() => {
    // Fondo cambia según BUY/SELL/NONE
    if (effectiveAction === "BUY") {
      return {
        pageBg: "radial-gradient(900px 520px at 50% 0%, rgba(34,197,94,0.18), rgba(11,15,25,1) 55%)",
        cardBg: "rgba(15, 23, 42, 0.85)",
        border: "rgba(34,197,94,0.22)",
        accent: "#22c55e",
        soft: "rgba(34,197,94,0.12)",
        chart: { bg: "rgba(2, 6, 23, 0.35)", grid: "rgba(148,163,184,0.15)", wick: "rgba(148,163,184,0.65)", up: "#22c55e", down: "#ef4444" },
      };
    }
    if (effectiveAction === "SELL") {
      return {
        pageBg: "radial-gradient(900px 520px at 50% 0%, rgba(239,68,68,0.18), rgba(11,15,25,1) 55%)",
        cardBg: "rgba(15, 23, 42, 0.85)",
        border: "rgba(239,68,68,0.22)",
        accent: "#ef4444",
        soft: "rgba(239,68,68,0.12)",
        chart: { bg: "rgba(2, 6, 23, 0.35)", grid: "rgba(148,163,184,0.15)", wick: "rgba(148,163,184,0.65)", up: "#22c55e", down: "#ef4444" },
      };
    }
    return {
      pageBg: "radial-gradient(900px 520px at 50% 0%, rgba(59,130,246,0.16), rgba(11,15,25,1) 55%)",
      cardBg: "rgba(15, 23, 42, 0.85)",
      border: "rgba(59,130,246,0.22)",
      accent: "#facc15",
      soft: "rgba(250,204,21,0.12)",
      chart: { bg: "rgba(2, 6, 23, 0.35)", grid: "rgba(148,163,184,0.15)", wick: "rgba(148,163,184,0.65)", up: "#22c55e", down: "#ef4444" },
    };
  }, [effectiveAction]);

  const updatedAt = useMemo(() => {
    if (!signal?.at) return "";
    try {
      return new Date(signal.at).toLocaleString();
    } catch {
      return "";
    }
  }, [signal?.at]);

  // Dibuja velas cuando llegan / cambia tamaño
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (candlesStatus !== "ok") return;
    if (!candles.length) return;

    const redraw = () => drawCandles(canvas, candles, theme.chart);

    redraw();

    // Redibujar al resize
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);

    return () => ro.disconnect();
  }, [candles, candlesStatus, theme.chart]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: theme.pageBg,
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* TITULO */}
        <h1 style={{ fontSize: 28, marginBottom: 20, fontWeight: 900, letterSpacing: 0.2 }}>
          <span style={{ color: "#fbbf24" }}>₿ BTCALERT</span>{" "}
          <span style={{ opacity: 0.92 }}>– MONITOREO Y ALERTA DE INVERSION</span>
        </h1>

        {status === "loading" && <p>Cargando datos...</p>}
        {status === "error" && <p>Error cargando señal.</p>}

        {signal && (
          <div
            style={{
              borderRadius: 22,
              padding: 22,
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {/* ENCABEZADO */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6, color: theme.accent }}>
                  {headlineFromAction(effectiveAction)}
                </div>
                <div style={{ opacity: 0.75 }}>{sublineFromAction(effectiveAction)}</div>
              </div>

              <div style={{ textAlign: "right", opacity: 0.7, fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>Última actualización</div>
                <div style={{ fontWeight: 800, opacity: 0.9 }}>{updatedAt}</div>
              </div>
            </div>

            {/* PRECIO */}
            <div style={{ fontSize: 56, fontWeight: 950, marginTop: 18 }}>
              {formatUSD(signal.price)}
            </div>

            {/* SCORE BAR */}
            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ opacity: 0.75 }}>Score</span>
                <div style={{ fontSize: 26, fontWeight: 950 }}>
                  {signal.score}/100
                </div>
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(17,24,39,0.9)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.06)",
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

              {/* si era BUY pero no pasó confirmación */}
              {signal.action === "BUY" && effectiveAction !== "BUY" && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#fbbf24", opacity: 0.95 }}>
                  Confirmación BUY: requiere score ≥ {BUY_MIN_SCORE}. (Ahora: {signal.score})
                </div>
              )}
            </div>

            {/* INDICADORES LIMPIOS */}
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1.2fr",
                gap: 16,
                alignItems: "end",
              }}
            >
              <div>
                <div style={{ opacity: 0.7 }}>RSI (14)</div>
                <div style={{ fontWeight: 950, fontSize: 22 }}>
                  {Number.isFinite(signal.rsi14) ? signal.rsi14.toFixed(2) : "—"}
                </div>
                <div style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>
                  1h: {fmtPct(signal.change1h)} • 24h: {fmtPct(signal.change24h)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 50</div>
                <div style={{ fontWeight: 950, fontSize: 22 }}>
                  {Number.isFinite(signal.ema50) ? formatUSD(signal.ema50) : "—"}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 200</div>
                <div style={{ fontWeight: 950, fontSize: 22 }}>
                  {Number.isFinite(signal.ema200) ? formatUSD(signal.ema200) : "—"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ opacity: 0.7 }}>Rebote 2h</div>
                <div style={{ fontWeight: 950, fontSize: 22 }}>{fmtPct(signal.rebound2h)}</div>
              </div>
            </div>

            {/* GRAFICO DE VELAS */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontWeight: 800, opacity: 0.9, marginBottom: 10 }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              <div
                style={{
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: theme.chart.bg,
                  padding: 12,
                }}
              >
                {candlesStatus === "loading" && (
                  <div style={{ opacity: 0.7, padding: 10 }}>Cargando velas…</div>
                )}

                {candlesStatus === "error" && (
                  <div
                    style={{
                      color: "#fca5a5",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.20)",
                      padding: 12,
                      borderRadius: 12,
                      fontSize: 13,
                      lineHeight: 1.35,
                    }}
                  >
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>
                      No se pudieron cargar las velas desde /api/candles.
                    </div>
                    <div>Detalle: {candlesErr || "Error desconocido"}</div>
                  </div>
                )}

                {candlesStatus === "ok" && (
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: "100%",
                      height: 260,
                      display: "block",
                      borderRadius: 12,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
