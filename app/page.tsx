"use client";

export default function Home() {
  return (
    <div
      style={{
        background: "black",
        color: "white",
        minHeight: "100vh",
        padding: 40,
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 32 }}>BTC APP – CAMBIO FORZADO</h1>
      <p>Si ves esto, Vercel ya está leyendo el archivo correcto.</p>
      <p>{new Date().toLocaleString()}</p>
    </div>
  );
}
