"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "loading" | "ok" | "error";
type MarketPoint = { t: number; p: number };

type SignalPayload = {
  at: number;
  verdict: boolean;
  score: number;
  price: number;
  rsi14: number;
  ema50: number;
  ema200: number;
  change1h: number;
  change24h: number;
  rebound2h: number;
  reason: string[];
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

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
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"} ${scaleX(d.t).toFixed(2)} ${scaleY(d.p).toFixed(2)}`
    )
    .join(" ");
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [price, setPrice] = useState<number | null>(null);
  const [chg24, setChg24] = useState<number | null>(null);
  const [series, setSeries] = useState<MarketPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [debug, setDebug] = useState("");

  // 🔔 Alertas
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alert, setAlert] = useState<SignalPayload | null>(null);
  const [alertToastOpen, setAlertToastOpen] = useState(false);

  const lastAlertAtRef = useRef<number>(0); // cooldown
  const lastSeenSignalAtRef = useRef<number>(0);

  // AudioContext se crea solo con gesto del usuario
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ✅ MODO PRUEBA: si abres la app con ?force=1, el polling usará /api/signal?force=1
  const [forceMode, setForceMode] = useState(false);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setForceMode(sp.get("force") === "1");
    } catch {
      setForceMode(false);
    }
  }, []);

  function playBeep() {
    try {
      const AudioContextImpl =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextImpl) return;

      if (!audioCtxRef.current) audioCtxRef.current = new AudioContextImpl();

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.value = 880;

      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      o.connect(g);
      g.connect(ctx.destination);

      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      // silencioso
    }
  }

  function vibrate(pattern: number | number[]) {
    try {
      if ("vibrate" in navigator) (navigator as any).vibrate(pattern);
    } catch {}
  }

  async function refresh() {
    try {
      setStatus("loading");
      setDebug("");

      const [btc, chart, c24] = await Promise.all([
        fetchJSON("/api/btc"),
        fetchJSON("/api/btc-chart"),
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
        ? prices
            .map(([t, p]) => ({ t: Number(t), p: Number(p) }))
            .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.p))
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

  // Lee la señal de /api/signal y dispara popup + sonido + vibración
  async function pollSignal() {
    try {
      // ✅ aquí está el cambio clave
      const url = forceMode ? "/api/signal?force=1" : "/api/signal";

      const s = await fetchJSON(url);
      const sig: SignalPayload | null = s?.lastSignal ?? null;
      if (!sig || !sig.at) return;

      // Evita re-procesar la misma señal
      if (sig.at <= lastSeenSignalAtRef.current) return;
      lastSeenSignalAtRef.current = sig.at;

      // Si no es veredicto positivo, no alertamos
      if (!sig.verdict) return;

      // Cooldown: no alertar más de 1 vez cada 60 min
      const now = Date.now();
      const cooldownMs = 60 * 60 * 1000;
      if (now - lastAlertAtRef.current < cooldownMs) return;

      // Umbral de score
      const minScore = 80;
      if (sig.score < minScore) return;

      lastAlertAtRef.current = now;
      setAlert(sig);
      setAlertToastOpen(true);

      // Vibración + sonido solo si el usuario activó alertas
      if (alertsEnabled) {
        vibrate([120, 80, 120, 80, 180]);
        playBeep();

        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification("BTC: Zona de entrada", {
              body: `Score ${sig.score}/100 · Precio $${sig.price.toFixed(2)}`,
            });
          }
        }
      }
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pollSignal();
    const id = setInterval(pollSignal, 30_000);
    return () => clearInterval(id);
  }, [alertsEnabled, forceMode]);

  const path = useMemo(() => (series.length ? makePath(series) : ""), [series]);
  const changeColor = (chg24 ?? 0) >= 0 ? "#22c55e" : "#ef4444";

  async function enableAlerts() {
    setAlertsEnabled(true);

    // “Desbloquea” audio por gesto
    playBeep();

    // Pide permiso de notificaciones (opcional)
    if ("Notification" in window) {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch {}
    }
  }

  const scoreBar = alert ? clamp(alert.score, 0, 100) : 0;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: "#0b0f19",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, marginBottom: 10 }}>₿ BTC en tiempo real</h1>

        {/* 🔔 Barra superior */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Alertas:{" "}
            <span
              style={{
                fontWeight: 700,
                color: alertsEnabled ? "#22c55e" : "#fbbf24",
              }}
            >
              {alertsEnabled ? "ACTIVAS" : "INACTIVAS"}
            </span>
            <span style={{ opacity: 0.7 }}> • Poll señal: 30s</span>
            <span style={{ opacity: 0.7 }}>
              {" "}
              • Modo prueba:{" "}
              <b style={{ color: forceMode ? "#22c55e" : "#94a3b8" }}>
                {forceMode ? "ON (?force=1)" : "OFF"}
              </b>
            </span>
          </div>

          <button
            onClick={enableAlerts}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #334155",
              background: alertsEnabled ? "#0f172a" : "#111827",
              color: "#e5e7eb",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            🔔 Activar alertas
          </button>
        </div>

        <div
          style={{
            border: "1px solid #1f2937",
            borderRadius: 16,
            padding: 16,
            background: "#0f172a",
          }}
        >
          {status === "loading" && <p>Cargando precio y gráfico…</p>}

          {status === "error" && (
            <div>
              <p style={{ color: "#fca5a5" }}>No se pudo cargar. Reintenta.</p>
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#0b1220",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  opacity: 0.9,
                }}
              >
                {debug || "Sin detalle"}
              </div>
              <button
                onClick={refresh}
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {status === "ok" && price != null && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  alignItems: "baseline",
                }}
              >
                <div style={{ fontSize: 42, fontWeight: 800 }}>
                  {formatUSD(price)}
                </div>

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
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                  Últimas 24h
                </div>
                <svg
                  width="100%"
                  viewBox="0 0 520 160"
                  style={{ display: "block" }}
                >
                  <path d={path} fill="none" stroke="#60a5fa" strokeWidth="2" />
                </svg>
              </div>

              <button
                onClick={refresh}
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                Actualizar ahora
              </button>

              <p style={{ opacity: 0.6, fontSize: 12, marginTop: 14 }}>
                Build Test 🚀
              </p>
            </>
          )}
        </div>
      </div>

      {/* ✅ Popup de alerta */}
      {alertToastOpen && alert && (
        <div
          onClick={() => setAlertToastOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 18,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              borderRadius: 18,
              border: "1px solid #334155",
              background: "#0b1220",
              padding: 16,
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  📌 BTC: Zona de entrada detectada
                </div>
                <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>
                  {new Date(alert.at).toLocaleString()}
                </div>
              </div>

              <button
                onClick={() => setAlertToastOpen(false)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {formatUSD(alert.price)}
              </div>
              <div style={{ fontSize: 14, opacity: 0.9 }}>
                <div>
                  Score: <b>{alert.score}/100</b> • RSI(14):{" "}
                  <b>{alert.rsi14.toFixed(1)}</b>
                </div>
                <div style={{ marginTop: 4, opacity: 0.9 }}>
                  1h: <b>{alert.change1h.toFixed(2)}%</b> • 24h:{" "}
                  <b>{alert.change24h.toFixed(2)}%</b> • Rebote 2h:{" "}
                  <b>{alert.rebound2h.toFixed(2)}%</b>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "#111827",
                  border: "1px solid #1f2937",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${scoreBar}%`,
                    background: scoreBar >= 80 ? "#22c55e" : "#fbbf24",
                  }}
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
                Razones: {alert.reason?.slice(0, 4).join(" • ") || "—"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  if (!alertsEnabled) enableAlerts();
                  vibrate([120, 80, 120]);
                  playBeep();
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Probar sonido/vibración
              </button>

              <button
                onClick={() => setAlertToastOpen(false)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Ok, entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
