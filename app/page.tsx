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
  bounce2h?: number; // %
  change1h?: number; // %
  change24h?: number; // %
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

  // si aún no tiene layout, no dibujes
  if (!cssW || !cssH) return;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW;
  const H = cssH;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, W, H);

  if (!candles || candles.length < 2) return;

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
  const bodyW = Math.max(2, Math.min(10, xStep * 0.62));
  const yOf = (p: number) => padT + (maxP - p) * (innerH / span);

  // grid horizontal suave
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  const gridLines = 4;
  for (let i = 1; i <= gridLines; i++) {
    const y = padT + (innerH * i) / (gridLines + 1);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const xCenter = padL + xStep * (i + 0.5);

    const yH = yOf(c.h);
    const yL = yOf(c.l);
    const yO = yOf(c.o);
    const yC = yOf(c.c);

    const up = c.c >= c.o;

    // wick
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
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

function headline(action: Action) {
  if (action === "BUY") return "🟢 Señal de compra";
  if (action === "SELL") return "🔴 Señal de venta";
  return "🟡 Sin señal clara";
}

function subtitle(action: Action) {
  if (action === "BUY") return "Condiciones favorables para compra (confirmación aplicada).";
  if (action === "SELL") return "Condiciones favorables para venta.";
  return "El mercado no muestra una oportunidad sólida ahora mismo.";
}

export default function Home() {
  const DEPLOY_MARKER = "BTCALERT-MOCK-RIGHTPANEL-PNG-V1";
  const gold = "#f5b301";

  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesError, setCandlesError] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // confirmación BUY como veníamos usando
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
        throw new Error("No llegaron velas suficientes");
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
  }, []);

  // ✅ FIX: draw reliable en producción + resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => drawCandles(canvas, candles);

    const t = setTimeout(draw, 60);
    window.addEventListener("resize", draw);

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", draw);
    };
  }, [candles]);

  const updatedAt = signal?.at ? new Date(signal.at).toLocaleString() : "";
  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;

  const bgGlow = useMemo(() => {
    // look del mock: glow cálido arriba + viñeta oscura
    const base =
      "radial-gradient(1200px 520px at 50% -10%, rgba(245,179,1,0.22), rgba(0,0,0,0) 58%),";
    if (!signal) return base;
    if (signal.action === "BUY")
      return base + "radial-gradient(900px 520px at 20% 0%, rgba(34,197,94,0.10), rgba(0,0,0,0) 60%),";
    if (signal.action === "SELL")
      return base + "radial-gradient(900px 520px at 20% 0%, rgba(239,68,68,0.10), rgba(0,0,0,0) 60%),";
    return base;
  }, [signal]);

  return (
    <main className="page" style={{ backgroundImage: bgGlow }}>
      <div className="marker">{DEPLOY_MARKER}</div>

      {/* flare + línea dorada superior */}
      <div className="topFlare" aria-hidden="true" />
      <div className="topLine" aria-hidden="true" />

      <div className="wrap">
        {/* HEADER FINAL: una sola línea, izquierda */}
        <header className="heroTitle">
          <span className="heroBtc">₿ BTCALERT</span>
          <span className="heroDash"> – </span>
          <span className="heroRest">MONITOREO Y ALERTA DE INVERSION</span>
        </header>

        <section className="card">
          <div className="cardInnerGlow" aria-hidden="true" />
          <div className="cardBottomGold" aria-hidden="true" />

          <div className="leftCol">
            {status === "loading" && <div className="hint">Cargando datos...</div>}
            {status === "error" && <div className="hintErr">Error cargando señal.</div>}

            {signal && (
              <>
                <div className="topRow">
                  <div>
                    <div className="statusRow">
                      <span
                        className="dot"
                        style={{
                          background:
                            signal.action === "BUY"
                              ? "#22c55e"
                              : signal.action === "SELL"
                              ? "#ef4444"
                              : gold,
                        }}
                      />
                      <div className="statusTitle">{headline(signal.action)}</div>
                    </div>
                    <div className="statusSub">{subtitle(signal.action)}</div>
                  </div>

                  <div className="updatedBox">
                    <div className="updatedLabel">Última actualización</div>
                    <div className="updatedValue">{updatedAt}</div>
                  </div>
                </div>

                <div className="priceGold">{formatUSD(signal.price)}</div>

                <div className="scoreBlock">
                  <div className="scoreLabel">Score</div>
                  <div className="scoreValue">{signal.score}/100</div>
                  <div className="scoreRail">
                    <div
                      className="scoreFill"
                      style={{
                        width: `${scoreBar}%`,
                        background:
                          scoreBar >= 75 ? "#22c55e" : scoreBar >= 50 ? "#fbbf24" : "#ef4444",
                      }}
                    />
                  </div>
                </div>

                <div className="grid4">
                  <div className="mBox">
                    <div className="mLabel">RSI (14)</div>
                    <div className="mValue">{signal.rsi14.toFixed(2)}</div>
                    <div className="mSmall">
                      1h:{" "}
                      {signal.change1h != null
                        ? `${signal.change1h > 0 ? "+" : ""}${signal.change1h.toFixed(2)}%`
                        : "—"}
                      {"  "}•{"  "}
                      24h:{" "}
                      {signal.change24h != null
                        ? `${signal.change24h > 0 ? "+" : ""}${signal.change24h.toFixed(2)}%`
                        : "—"}
                    </div>
                  </div>

                  <div className="mBox">
                    <div className="mLabel">EMA 50</div>
                    <div className="mValue">{formatUSD(signal.ema50)}</div>
                  </div>

                  <div className="mBox">
                    <div className="mLabel">EMA 200</div>
                    <div className="mValue">{formatUSD(signal.ema200)}</div>
                  </div>

                  <div className="mBox mRight">
                    <div className="mLabel">Rebote 2h</div>
                    <div className="mValue">
                      {signal.bounce2h != null
                        ? `${signal.bounce2h > 0 ? "+" : ""}${signal.bounce2h.toFixed(2)}%`
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="candlesTitle">Gráfico de velas (últimas 72 horas)</div>

                <div className="chartFrame">
                  <div className="chartBottomGold" aria-hidden="true" />

                  {candlesStatus === "loading" && <div className="chartHint">Cargando velas...</div>}
                  {candlesStatus === "error" && (
                    <div className="chartErr">
                      No se pudieron cargar velas.{" "}
                      <span className="chartErrDet">{candlesError}</span>
                    </div>
                  )}

                  <div className="chartBox">
                    <canvas ref={canvasRef} className="chartCanvas" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* PANEL DERECHO COMO MOCK */}
          <aside className="rightCol">
            <div className="brandBlock">
              <div className="brandSmall">Developed by</div>

              <div className="brandLogoWrap">
                <Image
                  src="/ndigital.png"
                  alt="N Digital"
                  width={170}
                  height={170}
                  priority
                  style={{ width: "170px", height: "auto" }}
                />
              </div>

              <div className="brandSmall" style={{ marginTop: 18 }}>
                Powered by
              </div>
              <div className="brandChatGPT">CHATGPT</div>
              <div className="brandOpenAI">OpenAI</div>
            </div>
          </aside>
        </section>
      </div>

      <style jsx global>{`
        .page {
          min-height: 100vh;
          padding: 42px 22px;
          background-color: #050912;
          color: #e5e7eb;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        /* viñeta */
        .page:before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(1200px 700px at 50% 40%, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.55) 85%),
            radial-gradient(900px 520px at 10% 20%, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.55) 92%);
          z-index: 0;
        }

        .marker {
          position: fixed;
          left: 10px;
          bottom: 10px;
          font-size: 11px;
          opacity: 0.22;
          pointer-events: none;
          z-index: 10;
        }

        .wrap {
          max-width: 1180px;
          margin: 0 auto;
          position: relative;
          z-index: 2;
        }

        /* flare */
        .topFlare {
          position: fixed;
          top: -80px;
          left: 50%;
          transform: translateX(-50%);
          width: min(1100px, 92vw);
          height: 220px;
          background: radial-gradient(
            closest-side,
            rgba(245, 179, 1, 0.35),
            rgba(245, 179, 1, 0.12) 40%,
            rgba(245, 179, 1, 0) 72%
          );
          filter: blur(2px);
          pointer-events: none;
          z-index: 1;
        }

        .topLine {
          position: fixed;
          top: 84px;
          left: 50%;
          transform: translateX(-50%);
          width: min(980px, 86vw);
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(245, 179, 1, 0),
            rgba(245, 179, 1, 0.95),
            rgba(245, 179, 1, 0)
          );
          box-shadow: 0 0 26px rgba(245, 179, 1, 0.35);
          pointer-events: none;
          z-index: 2;
        }

        /* header */
        .heroTitle {
          text-align: left;
          font-weight: 900;
          font-size: 34px;
          letter-spacing: 0.6px;
          margin-bottom: 18px;
          color: rgba(255, 255, 255, 0.92);
          text-shadow: 0 0 28px rgba(0, 0, 0, 0.55);
        }
        .heroBtc {
          color: #f5b301;
          text-shadow: 0 0 24px rgba(245, 179, 1, 0.35);
        }
        .heroDash {
          color: rgba(255, 255, 255, 0.65);
        }
        .heroRest {
          color: rgba(255, 255, 255, 0.85);
          font-weight: 900;
        }

        /* card */
        .card {
          position: relative;
          border-radius: 26px;
          padding: 28px;
          background: linear-gradient(160deg, rgba(15, 22, 40, 0.92), rgba(6, 10, 18, 0.94));
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 35px 110px rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(10px);
          overflow: hidden;
          display: grid;
          grid-template-columns: 1.65fr 0.75fr;
          gap: 26px;
        }

        .cardInnerGlow {
          position: absolute;
          inset: -40px;
          background: radial-gradient(900px 520px at 12% 0%, rgba(245, 179, 1, 0.12), rgba(0, 0, 0, 0) 60%),
            radial-gradient(900px 520px at 90% 40%, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0) 60%);
          pointer-events: none;
          z-index: 0;
        }

        .cardBottomGold {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: linear-gradient(90deg, rgba(245, 179, 1, 0), rgba(245, 179, 1, 0.6), rgba(245, 179, 1, 0));
          opacity: 0.55;
          pointer-events: none;
          z-index: 0;
        }

        .leftCol,
        .rightCol {
          position: relative;
          z-index: 1;
        }

        .topRow {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 10px;
        }

        .statusRow {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          display: inline-block;
          box-shadow: 0 0 18px rgba(245, 179, 1, 0.25);
        }

        .statusTitle {
          font-weight: 900;
          font-size: 18px;
          color: #f5b301;
        }

        .statusSub {
          margin-top: 8px;
          opacity: 0.7;
          font-weight: 600;
        }

        .updatedBox {
          text-align: right;
          opacity: 0.78;
          font-weight: 700;
          min-width: 220px;
        }

        .updatedLabel {
          font-size: 13px;
          opacity: 0.85;
        }

        .updatedValue {
          margin-top: 2px;
          font-size: 13px;
        }

        .priceGold {
          margin-top: 6px;
          font-size: 66px;
          font-weight: 950;
          letter-spacing: 0.4px;
          background: linear-gradient(180deg, #fff3c8 0%, #f5b301 58%, #c98600 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 42px rgba(245, 179, 1, 0.35);
        }

        .scoreBlock {
          margin-top: 18px;
        }
        .scoreLabel {
          opacity: 0.7;
          margin-bottom: 6px;
        }
        .scoreValue {
          font-size: 32px;
          font-weight: 950;
          margin-bottom: 10px;
        }
        .scoreRail {
          height: 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .scoreFill {
          height: 100%;
          border-radius: 999px;
        }

        .grid4 {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }
        .mLabel {
          opacity: 0.65;
          font-weight: 800;
          font-size: 13px;
        }
        .mValue {
          font-weight: 950;
          font-size: 28px;
          margin-top: 4px;
        }
        .mSmall {
          opacity: 0.6;
          margin-top: 6px;
          font-size: 13px;
        }
        .mRight {
          text-align: right;
        }

        .candlesTitle {
          margin-top: 18px;
          font-weight: 950;
          color: #f5b301;
          opacity: 0.95;
        }

        .chartFrame {
          margin-top: 10px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.12);
          padding: 14px;
          position: relative;
          overflow: hidden;
        }

        .chartBottomGold {
          position: absolute;
          left: 10%;
          right: 10%;
          bottom: 10px;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(245, 179, 1, 0), rgba(245, 179, 1, 0.55), rgba(245, 179, 1, 0));
          opacity: 0.35;
          pointer-events: none;
        }

        .chartHint {
          opacity: 0.75;
          margin-bottom: 10px;
          font-weight: 700;
        }
        .chartErr {
          color: #fca5a5;
          margin-bottom: 10px;
          font-weight: 800;
        }
        .chartErrDet {
          opacity: 0.85;
          font-weight: 700;
        }

        .chartBox {
          width: 100%;
          height: 270px;
          position: relative;
        }
        .chartCanvas {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.22);
        }

        /* right panel */
        .rightCol {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brandBlock {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          opacity: 0.9;
        }

        .brandSmall {
          font-size: 13px;
          font-weight: 800;
          opacity: 0.72;
        }

        .brandLogoWrap {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.95;
          filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.65));
        }

        .brandChatGPT {
          font-weight: 950;
          font-size: 22px;
          letter-spacing: 1px;
          color: rgba(255, 255, 255, 0.9);
        }

        .brandOpenAI {
          font-weight: 800;
          font-size: 13px;
          opacity: 0.75;
        }

        .hint {
          opacity: 0.8;
          font-weight: 700;
        }
        .hintErr {
          color: #f87171;
          font-weight: 800;
        }

        /* responsive */
        @media (max-width: 980px) {
          .heroTitle {
            text-align: center;
            font-size: 28px;
          }
          .card {
            grid-template-columns: 1fr;
          }
          .updatedBox {
            min-width: unset;
          }
          .rightCol {
            margin-top: 14px;
          }
        }
        @media (max-width: 760px) {
          .grid4 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .mRight {
            text-align: left;
          }
          .priceGold {
            font-size: 54px;
          }
        }
        @media (max-width: 520px) {
          .grid4 {
            grid-template-columns: 1fr;
          }
          .page {
            padding: 26px 14px;
          }
          .chartBox {
            height: 240px;
          }
        }
      `}</style>
    </main>
  );
}
