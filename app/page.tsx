"use client";

import { useEffect, useState } from "react";

type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

export default function Page() {
  const [price, setPrice] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [rsi, setRsi] = useState<number>(0);
  const [ema50, setEma50] = useState<number>(0);
  const [ema200, setEma200] = useState<number>(0);
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    fetch("/api/signal")
      .then(res => res.json())
      .then(data => {
        if (data?.lastSignal) {
          setPrice(data.lastSignal.price || 0);
          setScore(data.lastSignal.score || 0);
          setRsi(data.lastSignal.rsi || 0);
          setEma50(data.lastSignal.ema50 || 0);
          setEma200(data.lastSignal.ema200 || 0);
        }
      });

    fetch("/api/candles?limit=72")
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setCandles(data.candles);
        }
      });
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 40,
        background:
          "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        color: "white",
        fontFamily: "system-ui",
      }}
    >
      {/* HEADER */}
      <h1
        style={{
          fontSize: 28,
          fontWeight: 800,
          marginBottom: 30,
        }}
      >
        <span style={{ color: "#facc15" }}>₿ BTCALERT</span>
        <span style={{ color: "#eab308" }}>
          {" "}
          – MONITOREO Y ALERTA DE INVERSION
        </span>
      </h1>

      {/* PANEL */}
      <div
        style={{
          background: "#0f172a",
          padding: 30,
          borderRadius: 20,
          border: "1px solid #1e293b",
        }}
      >
        <h2 style={{ color: "#facc15" }}>● Sin señal clara</h2>

        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            marginTop: 20,
          }}
        >
          ${price.toLocaleString()}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 18 }}>Score</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {score}/100
          </div>
        </div>

        <div
          style={{
            height: 10,
            background: "#1e293b",
            borderRadius: 10,
            marginTop: 10,
          }}
        >
          <div
            style={{
              width: `${score}%`,
              height: "100%",
              background: "#ef4444",
              borderRadius: 10,
            }}
          />
        </div>

        {/* INDICADORES */}
        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 30,
          }}
        >
          <div>
            <div>RSI (14)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {rsi.toFixed(2)}
            </div>
          </div>

          <div>
            <div>EMA 50</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              ${ema50.toLocaleString()}
            </div>
          </div>

          <div>
            <div>EMA 200</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              ${ema200.toLocaleString()}
            </div>
          </div>
        </div>

        {/* GRAFICO */}
        <div style={{ marginTop: 40 }}>
          <h3>Gráfico de velas (últimas 72 horas)</h3>

          <div
            style={{
              marginTop: 20,
              height: 300,
              background: "#020617",
              borderRadius: 20,
              padding: 20,
              overflowX: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              {candles.map((candle, i) => {
                const isGreen = candle.c >= candle.o;
                const height = Math.abs(candle.c - candle.o);

                return (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: height / 10,
                      background: isGreen ? "#22c55e" : "#ef4444",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
