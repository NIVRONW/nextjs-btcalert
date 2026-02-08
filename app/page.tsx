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

type Action = "BUY" | "SELL" | "NONE";

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
        `${i === 0 ? "M" : "L"} ${scaleX(d.t).toFixed(2)} ${scaleY(d.p).toFixed(
          2
        )}`
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

function detectActionFromReason(reason: string[] | undefined | null): Action {
  const txt = (reason || []).join(" ").toLowerCase();
  if (txt.includes("venta") || txt.includes("sell") || txt.includes("🔴")) return "SELL";
  if (txt.includes("compra") || txt.includes("buy") || txt.includes("🟢")) return "BUY";
  return "NONE";
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

  // ✅ Debug visible
  const [forceMode, setForceMode] = useState(false);
  const [signalURL, setSignalURL] = useState("/api/signal");
  const [lastSignalRaw, setLastSignalRaw] = useState<any>(null);
  const [lastSignalInfo, setLastSignalInfo] = useState<string>("");

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const fm = sp.get("force") === "1";
      setForceMode(fm);
      setSignalURL(fm ? "/api/signal?force=1" : "/api/signal");
    } catch {
      setForceMode(false);
      setSignalURL("/api/signal");
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
    } catch {}
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

  function openAlert(sig: SignalPayload) {
    setAlert(sig);
    setAlertToastOpen(true);

    // Sonido + vibración solo si activaste alertas
    if (alertsEnabled) {
      vibrate([120, 80, 120, 80, 180]);
      playBeep();

      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          const action = detectActionFromReason(sig.reason);
          const title =
            action === "SELL"
              ? "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴"
              : "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";

          new Notification(title, {
            body: `Precio ${sig.price ? formatUSD(sig.price) : ""}`,
          });
        }
      }
    }
  }

  // Lee la señal de /api/signal y dispara popup + sonido + vibración
  async function pollSignal(customURL?: string) {
    try {
      const url = customURL || signalURL;

      const s = await fetchJSON(url);
      setLastSignalRaw(s);

      const sig: SignalPayload | null = s?.lastSignal ?? null;
      if (!sig || !sig.at) {
        setLastSignalInfo("No llegó lastSignal.");
        return;
      }

      const action = detectActionFromReason(sig.reason);

      setLastSignalInfo(
        `OK: verdict=${sig.verdict} score=${sig.score} action=${action} at=${sig.at} (URL=${url})`
      );

      // Evita re-procesar la misma señal
      if (sig.at <= lastSeenSignalAtRef.current) return;
      lastSeenSignalAtRef.current = sig.at;

      // Si no es veredicto positivo, no alertamos
      if (!sig.verdict) return;

      const now = Date.now();

      // ✅ En modo force, NO bloqueamos por cooldown / score
      const cooldownMs = forceMode ? 0 : 60 * 60 * 1000;
      const minScore = forceMode ? 0 : 80;

      if (now - lastAlertAtRef.current < cooldownMs) return;
      if (sig.score < minScore) return;

      lastAlertAtRef.current = now;
      openAlert(sig);
    } catch (e: any) {
      setLastSignalInfo(`ERROR pollSignal: ${String(e?.message ?? e)}`);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pollSignal();
    const id = setInterval(() => pollSignal(), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsEnabled, forceMode, signalURL]);

  const path = useMemo(() => (series.length ? makePath(series) : ""), [series]);
  const changeColor = (chg24 ?? 0) >= 0 ? "#22c55e" : "#ef4444";

  async function enableAlerts() {
    setAlertsEnabled(true);
    playBeep(); // desbloquea audio por gesto

    if ("Notification" in window) {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch {}
    }
  }

  const scoreBar = alert ? clamp(alert.score, 0, 100) : 0;
  const alertAction = alert ? detectActionFromReason(alert.reason) : "NONE";

  const headerText =
    alertAction === "SELL"
      ? "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴"
      : "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";

  const headerBg =
    alertAction === "SELL"
      ? "rgba(239, 68, 68, 0.15)" // rojo suave
      : "rgba(34, 197, 94, 0.15)"; // verde suave

  const headerBorder =
    alertAction === "SELL"
      ? "1px solid rgba(239, 68, 68, 0.35)"
      : "1px solid rgba(34, 197, 94, 0.35)";

  const headerBadgeColor = alertAction === "SELL" ? "#fca5a5" : "#86efac";

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

        {/* 🔎 DEBUG / PRUEBAS */}
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 14,
            background: "#0b1220",
            padding: 12,
            marginBottom: 12,
            fontSize: 12,
            opacity: 0.95,
          }}
        >
          <div
            style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
          >
            <div>
              URL señal usada por la app:{" "}
              <b style={{ color: "#60a5fa" }}>{signalURL}</b>
            </div>
            <div>
              Modo prueba:{" "}
              <b style={{ color: forceMode ? "#22c55e" : "#fbbf24" }}>
                {forceMode ? "ON (?force=1)" : "OFF"}
              </b>
            </div>
          </div>

          <div style={{ marginTop: 8, whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {lastSignalInfo || "Esperando primer poll…"}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => pollSignal()}
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
              🔄 Poll ahora
            </button>

            <button
              onClick={() => pollSignal("/api/signal?force=1")}
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
              🧪 Forzar señal desde API
            </button>

            <button
              onClick={() =>
                openAlert({
                  at: Date.now(),
                  verdict: true,
                  score: 99,
                  price: price ?? 0,
                  rsi14: 50,
                  ema50: 0,
                  ema200: 0,
                  change1h: 0,
                  change24h: 0,
                  rebound2h: 0,
                  reason: ["🟢 COMPRA", "TEST: popup directo (sin API)"],
                })
              }
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
              🚨 Probar alerta ahora (COMPRA)
            </button>

            <button
              onClick={() =>
                openAlert({
                  at: Date.now(),
                  verdict: true,
                  score: 99,
                  price: price ?? 0,
                  rsi14: 50,
                  ema50: 0,
                  ema200: 0,
                  change1h: 0,
                  change24h: 0,
                  rebound2h: 0,
                  reason: ["🔴 VENTA", "TEST: popup directo (sin API)"],
                })
              }
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
              🚨 Probar alerta ahora (VENTA)
            </button>
          </div>
        </div>

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
                <svg width="100%" viewBox="0 0 520 160" style={{ display: "block" }}>
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
            {/* Header COMPRA/VENTA con color */}
            <div
              style={{
                borderRadius: 14,
                padding: "10px 12px",
                background: headerBg,
                border: headerBorder,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                <span style={{ color: headerBadgeColor }}>{headerText}</span>
              </div>
              <div style={{ opacity: 0.85, fontSize: 12, marginTop: 2 }}>
                {new Date(alert.at).toLocaleString()}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ opacity: 0.85, fontSize: 12 }}>
                Señal detectada por el sistema
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
                Razones: {alert.reason?.slice(0, 6).join(" • ") || "—"}
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

      {/* RAW debug (por si quieres ver la respuesta) */}
      {lastSignalRaw && (
        <div
          style={{
            maxWidth: 780,
            margin: "12px auto 0",
            padding: 12,
            borderRadius: 14,
            border: "1px solid #334155",
            background: "#0b1220",
            fontSize: 12,
            opacity: 0.9,
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(lastSignalRaw, null, 2)}
        </div>
      )}
    </main>
  );
}
