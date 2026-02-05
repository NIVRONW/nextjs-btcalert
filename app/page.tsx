"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "loading" | "ok" | "error";
type MarketPoint = { t: number; p: number };

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}


<p style={{ opacity: 0.6, fontSize: 12 }}>Build: test</p>


function makePath(points: MarketPoint[], w = 520, h = 160, pad = 10) {
  const xs = points.map((d) => d.t);
  const ys = points.map((d) => d.p);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = (x: number) =>
    pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);

  const scaleY = (y: number) =>
    h - pad - ((y - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);

  return points
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(d.t).toFixed(2)} ${scaleY(d.p).toFixed(2)}`)
    .join(" ");
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [price, setPrice] = useState<number | null>(null);
  const [chg24, setChg24] = useState<number | null>(null);
  const [series, setSeries] = useState<MarketPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [debug, setDebug] = useState("");

  async function refresh() {
    try {
      setStatus("loading");
      setDebug("");

      const [btc, chart, c24] = await Promise.all([
        fetchJSON("/api/btc"),
        fetchJSON("/api/btc-chart"),
        // si aún no existe, no rompemos
        (async () => {
          try {
            return await fetchJSON("/api/btc24h");
          } catch {
            return { chg: null };
          }
        })(),
      ]);

      const usd = Number(btc?.usd);
      const chg = c24?.chg === null ? null : Number(c24?.chg);

      const prices: [number, number][] = chart?.prices;
      const pts = Array.isArray(prices)
        ? prices.map(([t, p]) => ({ t: Number(t), p: Number(p) })).filter((d) => Number.isFinite(d.t) && Number.isFinite(d.p))
        : [];

      if (!Number.isFinite(usd)) throw new Error("Precio inválido");
      if (!pts.length) throw new Error("No llegó serie de gráfico");

      setPrice(usd);
      setChg24(Number.isFinite(chg as any) ? (chg as number) : null);
      setSeries(pts);

      setUpdatedAt(new Date().toLocaleString());
      setStatus("ok");
    } catch (e: any) {
      setStatus("error");
      setDebug(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  const path = useMemo(() => (series.length ? makePath(series) : ""), [series]);
  const changeColor = (chg24 ?? 0) >= 0 ? "#22c55e" : "#ef4444";

  return (
    <main style={{ minHeight: "100vh", padding: 18, background: "#0b0f19", color: "#e5e7eb", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, marginBottom: 10 }}>₿ BTC en tiempo real</h1>

        <div style={{ border: "1px solid #1f2937", borderRadius: 16, padding: 16, background: "#0f172a" }}>
          {status === "loading" && <p>Cargando precio y gráfico…</p>}

          {status === "error" && (
            <div>
              <p style={{ color: "#fca5a5" }}>No se pudo cargar. Reintenta.</p>
              <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #334155", background: "#0b1220", fontSize: 12, whiteSpace: "pre-wrap", opacity: 0.9 }}>
                {debug || "Sin detalle"}
              </div>
              <button
                onClick={refresh}
                style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, border: "1px solid #334155", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
              >
                Reintentar
              </button>
            </div>
          )}

          {status === "ok" && price != null && (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ fontSize: 42, fontWeight: 800 }}>{formatUSD(price)}</div>

                <div style={{ fontSize: 16 }}>
                  Cambio 24h:{" "}
                  {chg24 === null ? (
                    <span style={{ opacity: 0.7 }}>--</span>
                  ) : (
                    <span style={{ color: changeColor, fontWeight: 700 }}>
                      {chg24 >= 0 ? "+" : ""}
                      {chg24.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
                Actualizado: {updatedAt} • Auto: cada 1 min
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Últimas 24h</div>
                <svg width="100%" viewBox="0 0 520 160" style={{ display: "block" }}>
                  <path d={path} fill="none" stroke="#60a5fa" strokeWidth="2" />
                </svg>
              </div>

              <button
                onClick={refresh}
                style={{ marginTop: 10, padding: "10px 14px", borderRadius: 12, border: "1px solid #334155", background: "#111827", color: "#e5e7eb", cursor: "pointer" }}
              >
                Actualizar ahora
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
