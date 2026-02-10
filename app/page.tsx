"use client";

import Image from "next/image";
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
  bounce2h?: number;
  change1h?: number;
  change24h?: number;
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

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function drawCandles(canvas: HTMLCanvasElement, candles: Candle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW;
  const H = cssH;
  ctx.clearRect(0, 0, W, H);

  if (!candles?.length) return;

  const padL = 18;
  const padR = 14;
  const padT = 14;
  const padB = 18;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    minP = Math.min(minP, c.l);
    maxP = Math.max(maxP, c.h);
  }
  const span = Math.max(1e-9, maxP - minP);

  const xStep = innerW / Math.max(1, candles.length);
  const bodyW = Math.max(2, Math.min(9, xStep * 0.62));

  const yOf = (p: number) => padT + (maxP - p) * (innerH / span);

  // grid suave
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  const lines = 4;
  for (let i = 1; i <= lines; i++) {
    const y = padT + (innerH * i) / (lines + 1);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  // velas
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const xCenter = padL + xStep * (i + 0.5);

    const yH = yOf(c.h);
    const yL = yOf(c.l);
    const yO = yOf(c.o);
    const yC = yOf(c.c);

    const up = c.c >= c.o;

    // wick
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(xCenter, yH);
    ctx.lineTo(xCenter, yL);
    ctx.stroke();

    // body
    const yTop = Math.min(yO, yC);
    const yBot = Math.max(yO, yC);
    const h = Math.max(2, yBot - yTop);

    ctx.fillStyle = up ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
    ctx.fillRect(xCenter - bodyW / 2, yTop, bodyW, h);
  }
}

export default function Home() {
  // 🔥 cambia este texto si quieres confirmar en producción que sí cambió
  const DEPLOY_MARKER = "BTCALERT-CINEMATIC-AUTO-V2";

  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesError, setCandlesError] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // confirmación BUY (si quieres mantenerla)
  const BUY_MIN_SCORE = 80;

  async function loadSignal() {
    try {
      setStatus("loading");
      const s = await fetchJSON("/api/signal");
      const last = (s?.lastSignal ?? null) as SignalPayload | null;

      if (last && last.action === "BUY" && Number(last.score) < BUY_MIN_SCORE) {
        setSignal({ ...last, action: "NONE", verdict: false });
      } else {
        setSignal(last);
      }

      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles() {
    try {
      setCandlesStatus("loading");
      setCandlesError("");

      const j = await fetchJSON("/api/candles?limit=72");
      const arr = (j?.candles ?? []) as Candle[];

      if (!Array.isArray(arr) || arr.length < 10) {
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }

      arr.sort((a, b) => a.t - b.t);
      setCandles(arr);
      setCandlesStatus("ok");
    } catch (e: any) {
      setCandles([]);
      setCandlesStatus("error");
      setCandlesError(e?.message || "candles_error");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const doDraw = () => drawCandles(canvas, candles);
    doDraw();

    const onResize = () => doDraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [candles]);

  const updatedAt = signal?.at ? new Date(signal.at).toLocaleString() : "—";
  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;

  const gold = "#f5b301";
  const green = "#22c55e";
  const red = "#ef4444";

  const action: Action = signal?.action ?? "NONE";

  const actionUI = useMemo(() => {
    if (action === "BUY") {
      return {
        dot: green,
        title: "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢",
        desc: "Se detectó una condición favorable para compra.",
      };
    }
    if (action === "SELL") {
      return {
        dot: red,
        title: "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴",
        desc: "Se detectó una condición favorable para venta.",
      };
    }
    return {
      dot: gold,
      title: "Sin señal clara",
      desc: "El mercado no muestra una oportunidad sólida ahora mismo.",
    };
  }, [action, gold, green, red]);

  const bg = useMemo(() => {
    return {
      backgroundColor: "#05070e",
      backgroundImage: `
        radial-gradient(900px 520px at 50% 0%, rgba(245,179,1,0.22), rgba(0,0,0,0) 55%),
        radial-gradient(1200px 700px at 20% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%),
        radial-gradient(900px 700px at 85% 40%, rgba(255,255,255,0.05), rgba(0,0,0,0) 62%),
        radial-gradient(1400px 900px at 50% 70%, rgba(0,0,0,0), rgba(0,0,0,0.85) 72%),
        linear-gradient(180deg, #0a0f1c 0%, #05070e 55%, #03040a 100%)
      `,
    } as const;
  }, []);

  return (
    <main style={{ minHeight: "100vh", ...bg, color: "#e5e7eb", fontFamily: "system-ui" }}>
      {/* marker */}
      <div
        style={{
          position: "fixed",
          left: 10,
          bottom: 10,
          fontSize: 11,
          opacity: 0.18,
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
        {DEPLOY_MARKER}
      </div>

      {/* top flare line */}
      <div
        style={{
          position: "absolute",
          top: 88,
          left: "50%",
          transform: "translateX(-50%)",
          width: "78%",
          height: 3,
          background: "linear-gradient(90deg, rgba(0,0,0,0), rgba(245,179,1,0.95), rgba(0,0,0,0))",
          boxShadow: "0 0 30px rgba(245,179,1,0.55)",
          opacity: 0.75,
        }}
      />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "54px 18px 64px" }}>
        {/* HEADER */}
        <header style={{ marginBottom: 26 }}>
          <div style={{ textAlign: "center" }}>
            {/* BTCALERT más pequeño */}
            <div
              style={{
                fontWeight: 950,
                letterSpacing: 1,
                fontSize: 24,
                lineHeight: 1.05,
                textTransform: "uppercase",
                textShadow: "0 0 26px rgba(245,179,1,0.18)",
                color: gold,
              }}
            >
              ₿ BTCALERT
            </div>

            {/* MONITOREO... más grande */}
            <div
              style={{
                marginTop: 10,
                fontWeight: 950,
                letterSpacing: 1,
                fontSize: 40,
                lineHeight: 1.08,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.90)",
                textShadow: "0 0 22px rgba(0,0,0,0.55)",
              }}
            >
              MONITOREO Y ALERTA DE INVERSION
            </div>
          </div>
        </header>

        {status === "loading" && <p style={{ opacity: 0.8 }}>Cargando datos...</p>}
        {status === "error" && <p style={{ color: "#f87171" }}>Error cargando señal.</p>}

        {signal && (
          <section
            style={{
              borderRadius: 26,
              padding: 26,
              background:
                "linear-gradient(160deg, rgba(16,22,38,0.86) 0%, rgba(10,14,26,0.82) 55%, rgba(8,10,18,0.84) 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow:
                "0 28px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -120px 220px rgba(245,179,1,0.08)",
              backdropFilter: "blur(8px)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* glow inferior dorado */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -120,
                height: 240,
                background: "radial-gradient(700px 180px at 50% 0%, rgba(245,179,1,0.22), rgba(0,0,0,0) 70%)",
                pointerEvents: "none",
              }}
            />

            {/* TOP GRID */}
            <div
              className="cine-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 22,
                alignItems: "start",
                position: "relative",
                zIndex: 1,
              }}
            >
              {/* LEFT */}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    {/* ✅ Indicador grande + punto pequeño (NO círculo gigante) */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: actionUI.dot,
                          boxShadow: `0 0 14px ${action === "BUY" ? "rgba(34,197,94,0.55)" : action === "SELL" ? "rgba(239,68,68,0.45)" : "rgba(245,179,1,0.55)"}`,
                        }}
                      />
                      <div style={{ fontWeight: 950, fontSize: 24, color: actionUI.dot }}>
                        {actionUI.title}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, opacity: 0.82, fontSize: 18, maxWidth: 760 }}>
                      {actionUI.desc}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", opacity: 0.72, fontWeight: 800, fontSize: 13.5 }}>
                    <div>Última actualización</div>
                    <div style={{ marginTop: 2 }}>{updatedAt}</div>
                  </div>
                </div>

                {/* precio */}
                <div
                  style={{
                    fontSize: 70,
                    fontWeight: 950,
                    marginTop: 14,
                    letterSpacing: 0.4,
                    lineHeight: 1.02,
                    background: "linear-gradient(180deg, #fff3c4 0%, #f5b301 55%, #c98200 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    textShadow: "0 0 42px rgba(245,179,1,0.20)",
                  }}
                >
                  {formatUSD(signal.price)}
                </div>

                {/* score */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ opacity: 0.68, marginBottom: 8, fontSize: 13.5 }}>Score</div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 12 }}>
                    {signal.score}/100
                  </div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${scoreBar}%`,
                        background: action === "BUY" ? green : action === "SELL" ? red : "#ef4444",
                        boxShadow:
                          action === "BUY"
                            ? "0 0 18px rgba(34,197,94,0.20)"
                            : action === "SELL"
                            ? "0 0 18px rgba(239,68,68,0.18)"
                            : "0 0 18px rgba(239,68,68,0.18)",
                      }}
                    />
                  </div>
                </div>

                {/* métricas */}
                <div
                  style={{
                    marginTop: 20,
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 18,
                  }}
                  className="cine-metrics"
                >
                  <div>
                    <div style={{ opacity: 0.62, fontSize: 12.5 }}>RSI (14)</div>
                    <div style={{ fontWeight: 900, fontSize: 28, marginTop: 6 }}>
                      {signal.rsi14.toFixed(2)}
                    </div>
                    <div style={{ opacity: 0.55, marginTop: 6, fontSize: 12.5 }}>
                      1h:{" "}
                      {signal.change1h != null ? `${signal.change1h > 0 ? "+" : ""}${signal.change1h.toFixed(2)}%` : "—"}{" "}
                      • 24h:{" "}
                      {signal.change24h != null ? `${signal.change24h > 0 ? "+" : ""}${signal.change24h.toFixed(2)}%` : "—"}
                    </div>
                  </div>

                  <div>
                    <div style={{ opacity: 0.62, fontSize: 12.5 }}>EMA 50</div>
                    <div style={{ fontWeight: 900, fontSize: 28, marginTop: 6 }}>
                      {formatUSD(signal.ema50)}
                    </div>
                  </div>

                  <div>
                    <div style={{ opacity: 0.62, fontSize: 12.5 }}>EMA 200</div>
                    <div style={{ fontWeight: 900, fontSize: 28, marginTop: 6 }}>
                      {formatUSD(signal.ema200)}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ opacity: 0.62, fontSize: 12.5 }}>Rebote 2h</div>
                    <div style={{ fontWeight: 900, fontSize: 28, marginTop: 6 }}>
                      {signal.bounce2h != null ? `${signal.bounce2h > 0 ? "+" : ""}${signal.bounce2h.toFixed(2)}%` : "0.00%"}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <aside
                className="cine-right"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  justifyContent: "flex-start",
                  gap: 14,
                  paddingTop: 18,
                  justifySelf: "end",
                }}
              >
                <div style={{ textAlign: "right", opacity: 0.65, fontWeight: 800, fontSize: 13 }}>
                  Developed by
                </div>

                {/* ✅ wrapper 100% y alineado al borde derecho */}
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "flex-end",
                  }}
                >
                  <div
  style={{
    width: 260,
    display: "flex",
    justifyContent: "flex-end",
  }}
>
  <Image
    src="/ndigital.png"
    alt="N Digital"
    width={400}
    height={400}
    priority
    style={{
      width: "100%",
      height: "auto",
      display: "block",
    }}
  />
</div>
                </div>

                <div style={{ textAlign: "right", opacity: 0.60, fontWeight: 800, fontSize: 13, marginTop: 6 }}>
                  Powered by
                </div>

                <div style={{ textAlign: "right", fontWeight: 950, letterSpacing: 0.6 }}>
                  CHATGPT
                </div>

                <div style={{ textAlign: "right", opacity: 0.55, fontWeight: 800, fontSize: 12 }}>
                  OpenAI
                </div>
              </aside>
            </div>

            {/* candles full width */}
            <div style={{ marginTop: 18, position: "relative", zIndex: 1 }}>
              <div style={{ fontWeight: 950, marginBottom: 10, color: gold, fontSize: 18 }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              <div
                style={{
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.10))",
                  padding: 14,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 -90px 140px rgba(0,0,0,0.35)",
                }}
              >
                {candlesStatus === "loading" && <div style={{ opacity: 0.75 }}>Cargando velas...</div>}

                {candlesStatus === "error" && (
                  <div style={{ color: "#fca5a5" }}>
                    No se pudieron cargar las velas desde <b>/api/candles</b>.
                    <div style={{ marginTop: 6, opacity: 0.85 }}>Detalle: {candlesError}</div>
                  </div>
                )}

                <div
                  style={{
                    width: "100%",
                    height: 320,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(3,6,12,0.55)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03), inset 0 -80px 160px rgba(0,0,0,0.55)",
                    overflow: "hidden",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "block",
                    }}
                  />
                </div>
              </div>
            </div>

            <style jsx>{`
              @media (max-width: 980px) {
                .cine-grid {
                  grid-template-columns: 1fr !important;
                }
                .cine-right {
                  align-items: flex-start !important;
                  padding-top: 10px !important;
                  justify-self: start !important;
                }
              }
              @media (max-width: 760px) {
                .cine-metrics {
                  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                }
              }
              @media (max-width: 480px) {
                .cine-metrics {
                  grid-template-columns: 1fr !important;
                }
              }
            `}</style>
          </section>
        )}
      </div>
    </main>
  );
}
