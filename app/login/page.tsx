"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = useMemo(() => params.get("next") || "/observaciones", [params]);

  const [dni, setDni] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bgStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    backgroundImage:
      'linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), url("https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/cerro%205.jpg")',
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (data.session) {
        router.replace(nextUrl);
        router.refresh();
        return;
      }
      setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [router, nextUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!dni.trim() || !password) {
      setErr("Completa DNI y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const email = `${dni.trim()}@observaciones.local`;

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErr(error.message.includes("Invalid login credentials")
          ? "Credenciales incorrectas."
          : `Error: ${error.message}`
        );
        return;
      }

      // ✅ Fuerza a que la cookie/sesión quede lista antes de navegar
      await supabase.auth.getSession();

      router.replace(nextUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main style={bgStyle}>
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 18,
            padding: 18,
            backgroundImage:
              'linear-gradient(rgba(2,6,23,0.55), rgba(2,6,23,0.55)), url("https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/fodo%2001.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "0 18px 40px rgba(2,6,23,0.45)",
            color: "#e2e8f0",
          }}
        >
          <h1 style={{ margin: "4px 0 0", fontSize: 22, color: "#e2e8f0" }}>Ingresar</h1>
          <p style={{ marginTop: 8, opacity: 0.85, color: "#cbd5f5" }}>Verificando sesión...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={bgStyle}>
      <div style={{ display: "grid", gap: 6, placeItems: "center" }}>
        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/Img/bienvenidos.png"
          alt="Bienvenidos"
          style={{
            width: "min(491px, 95%)",
            height: "auto",
            filter: "drop-shadow(0 10px 24px rgba(2,6,23,0.45))",
          }}
        />

        <div
          style={{
            width: "100%",
            maxWidth: 440,
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 18,
            padding: 18,
            backgroundImage:
              'linear-gradient(rgba(2,6,23,0.55), rgba(2,6,23,0.55)), url("https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/fodo%2001.jpg")',
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "0 18px 40px rgba(2,6,23,0.45)",
            color: "#e2e8f0",
          }}
        >
        <h1 style={{ margin: "4px 0 0", fontSize: 22, color: "#e2e8f0" }}>Ingresar</h1>
        <p style={{ marginTop: 6, opacity: 0.85, color: "#cbd5f5" }}>DNI + contraseña</p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>DNI</span>
            <input
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="60615625"
              inputMode="numeric"
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.4)",
                background: "rgba(15,23,42,0.7)",
                color: "#e2e8f0",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.4)",
                background: "rgba(15,23,42,0.7)",
                color: "#e2e8f0",
                outline: "none",
              }}
            />
          </label>

          {err && (
            <div style={{ padding: 10, border: "1px solid #ef4444", borderRadius: 10, color: "#b91c1c", background: "#fff5f5" }}>
              {err}
            </div>
          )}

          <button
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(34,197,94,0.6)",
              background: "linear-gradient(135deg, #22c55e, #0ea5e9)",
              color: "#0b1220",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          <Link href="/" style={{ fontSize: 13, opacity: 0.85, color: "#e2e8f0" }}>
            ← Volver al inicio
          </Link>
          </form>
        </div>
      </div>
    </main>
  );
}
