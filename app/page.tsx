"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Candle = { t: number; o: number; h: number; l: number; c: number };

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function drawCandles(canvas: HTMLCanvasElement, candles: Candle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (!w || !h) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);

  if (!candles.length) return;

  let min = Infinity;
  let max = -Infinity;

  candles.forEach(c => {
    min = Math.min(min, c.l);
    max = Math.max(max, c.h);
  });

  const pad = 20;
  const width = w - pad * 2;
  const height = h - pad * 2;
  const step = width / candles.length;

  const y = (p: number) =>
    pad + (max - p) * (height / (max - min));

  candles.forEach((c, i) => {
    const x = pad + i * step + step / 2;
    const up = c.c >= c.o;

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(x, y(c.h));
    ctx.lineTo(x, y(c.l));
    ctx.stroke();

    ctx.fillStyle = up ? "#22c55e" : "#ef4444";
    const top = Math.min(y(c.o), y(c.c));
    const body = Math.abs(y(c.o) - y(c.c));
    ctx.fillRect(x - 4, top, 8, Math.max(2, body));
  });
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [price] = useState(70506.68);

  const candles: Candle[] = [];

  useEffect(() => {
    if (!canvasRef.current) return;
    drawCandles(canvasRef.current, candles);
  }, []);

  return (
    <main className="page">

      <div className="flare" />

      <header className="header">
        ₿ BTCALERT – MONITOREO Y ALERTA DE INVERSION
      </header>

      <div className="card">

        <div className="left">

          <div className="status">
            <span className="dot" />
            Sin señal clara
          </div>

          <div className="price">
            {formatUSD(price)}
          </div>

          <div className="chart-title">
            Gráfico de velas (últimas 72 horas)
          </div>

          <div className="chart">
            <canvas ref={canvasRef} />
          </div>

        </div>

        <div className="right">

          <div className="dev">Developed by</div>

          <Image
            src="/ndigital.png"
            alt="N Digital"
            width={220}
            height={220}
            style={{ margin: "20px 0" }}
          />

          <div className="powered">
            Powered by ChatGPT
          </div>

        </div>

      </div>

      <style jsx global>{`

        body {
          margin: 0;
        }

        .page {
          min-height: 100vh;
          padding: 60px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,180,60,0.25), transparent 45%),
            linear-gradient(#0b1220,#040810);
          color: white;
          font-family: system-ui;
          position: relative;
        }

        .flare {
          position: absolute;
          top: 40px;
          left: 50%;
          transform: translateX(-50%);
          width: 80%;
          height: 4px;
          background: linear-gradient(to right, transparent, #f5b301, transparent);
          box-shadow: 0 0 30px #f5b301;
        }

        .header {
          text-align: center;
          font-size: 34px;
          font-weight: 900;
          color: #f5b301;
          margin-bottom: 50px;
          text-shadow: 0 0 30px rgba(245,179,1,0.6);
        }

        .card {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 40px;
          padding: 50px;
          border-radius: 28px;
          background: linear-gradient(160deg,#0f1628,#050a16);
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow:
            0 40px 120px rgba(0,0,0,0.7),
            inset 0 -4px 80px rgba(245,179,1,0.2);
        }

        .status {
          color: #facc15;
          font-weight: 600;
          margin-bottom: 20px;
        }

        .price {
          font-size: 72px;
          font-weight: 900;
          background: linear-gradient(#fff6d1,#f5b301,#c98600);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 40px rgba(245,179,1,0.6);
          margin-bottom: 40px;
        }

        .chart-title {
          color: #f5b301;
          margin-bottom: 15px;
        }

        .chart {
          height: 260px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: inset 0 -40px 80px rgba(245,179,1,0.2);
        }

        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }

        .right {
          text-align: center;
          opacity: 0.9;
        }

        .dev {
          font-size: 14px;
          opacity: 0.6;
        }

        .powered {
          margin-top: 20px;
          font-size: 14px;
          opacity: 0.6;
        }

      `}</style>

    </main>
  );
}
