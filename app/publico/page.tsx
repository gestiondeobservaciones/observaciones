"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Semaforo = "verde" | "amarillo" | "rojo";

type Obs = {
  id: string;
  estado: "pendiente" | "cerrada";
  responsable: string;
  area: string;
  equipo_lugar: string;
  categoria: "bajo" | "medio" | "alto";
  plazo: string; // YYYY-MM-DD
  descripcion: string;
  evidencia_url: string | null;

  creado_por: string;
  creado_en: string;

  cierre_descripcion: string | null;
  cierre_evidencia_url: string | null;
  cerrado_por: string | null;
  cerrado_en: string | null;
};

function parseDateYYYYMMDD(s: string) {
  // s: "2026-01-31"
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function diffDays(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bb - aa) / ms);
}

/**
 * Reglas:
 * - Vencido: vence hoy o ya pasó (rojo)
 * - Por vencer: >75% del tiempo consumido (amarillo)
 * - En tiempo: <75% consumido (verde)
 *
 * Como no guardamos "fecha de creación como plazo base", usamos:
 * - totalDias = días entre creado_en y plazo
 * - consumido = días entre creado_en y hoy
 */
function getSemaforo(obs: Obs): Semaforo {
  const hoy = new Date();
  const fechaPlazo = parseDateYYYYMMDD(obs.plazo);
  const diasParaVencer = diffDays(hoy, fechaPlazo);

  // vence hoy o ya pasó
  if (diasParaVencer <= 0) return "rojo";

  const creado = new Date(obs.creado_en);
  const total = Math.max(1, diffDays(creado, fechaPlazo));
  const consumido = Math.max(0, diffDays(creado, hoy));
  const ratio = consumido / total;

  if (ratio >= 0.75) return "amarillo";
  return "verde";
}

function chipStyle(sem: Semaforo): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(0,0,0,0.08)",
  };

  if (sem === "verde") return { ...base, background: "#16a34a", color: "white" };
  if (sem === "amarillo") return { ...base, background: "#f59e0b", color: "black" };
  return { ...base, background: "#ef4444", color: "white" };
}

function categoriaPill(cat: Obs["categoria"]): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "white",
  };
  if (cat === "alto") return { ...base, fontWeight: 700 };
  if (cat === "medio") return { ...base, fontWeight: 600, opacity: 0.95 };
  return { ...base, opacity: 0.9 };
}

export default function ObservacionesPage() {
  const [data, setData] = useState<Obs[]>([]);
  const [loading, setLoading] = useState(true);
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState<string>("");

  async function load() {
    setLoading(true);

    // usuario actual
    const { data: ures } = await supabase.auth.getUser();
    setMeEmail(ures.user?.email ?? null);

    // observaciones
    const { data, error } = await supabase
      .from("observaciones")
      .select("*")
      .order("creado_en", { ascending: false });

    if (!error && data) setData(data as Obs[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const pendientes = useMemo(() => data.filter((o) => o.estado === "pendiente"), [data]);
  const cerradas = useMemo(() => data.filter((o) => o.estado === "cerrada"), [data]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function openZoom(url: string, label: string) {
    setZoomUrl(url);
    setZoomLabel(label || "Evidencia");
    setZoomOpen(true);
  }

  function closeZoom() {
    setZoomOpen(false);
    setZoomUrl(null);
    setZoomLabel("");
  }

  if (loading) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <div style={{ padding: 18, background: "#f5f7fb", minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Observaciones</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {meEmail ? <>Sesión: <b>{meEmail}</b></> : <>Sesión no detectada</>}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <Link
          href="/observaciones/nueva"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#0ea5e9",
            color: "white",
            textDecoration: "none",
            fontWeight: 800,
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          ➕ Nueva observación
        </Link>

        <button
          onClick={load}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "white",
            border: "1px solid rgba(0,0,0,0.14)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          🔄 Recargar
        </button>

        <button
          onClick={logout}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "#111827",
            color: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          Salir
        </button>
      </div>

      {/* Pendientes */}
      <div
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>
            Pendientes ({pendientes.length})
          </div>
        </div>

        {pendientes.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>No hay pendientes.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {pendientes.map((o) => {
              const sem = getSemaforo(o);
              return (
                <div
                  key={o.id}
                  style={{
                    border: "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 12,
                    padding: 12,
                    display: "grid",
                    gap: 8,
                    background: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>
                      {o.area} — {o.descripcion}
                    </div>

                    <div style={{ flex: 1 }} />

                    <span style={chipStyle(sem)}>
                      {sem === "verde" ? "En tiempo" : sem === "amarillo" ? "Por vencer" : "Vencido"}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Responsable: <b>{o.responsable}</b> | Equipo/Lugar: <b>{o.equipo_lugar}</b> |{" "}
                    <span style={categoriaPill(o.categoria)}>Categoría: {o.categoria}</span> | Fecha:{" "}
                    <b>{o.plazo.split("-").reverse().join("/")}</b>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Link
                      href={`/observaciones/${o.id}/cerrar`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#16a34a",
                        color: "white",
                        textDecoration: "none",
                        fontWeight: 900,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      ✅ Cerrar (con evidencia)
                    </Link>

                    {o.evidencia_url ? (
                      <a
                        href={o.evidencia_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.14)",
                          background: "white",
                          textDecoration: "none",
                          fontWeight: 800,
                          color: "#111827",
                        }}
                      >
                        📎 Ver evidencia
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Sin evidencia</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cerradas */}
      <div
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            margin: "6px 0 12px 0",
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.08)",
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: 0.4,
            color: "#0f172a",
          }}
        >
          OBSERVACIONES CERRADAS ({cerradas.length})
        </div>

        {cerradas.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>No hay cerradas.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {cerradas.map((o) => (
              <div
                key={o.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                  background: "#ffffff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>
                    {o.area} — <span style={{ fontWeight: 800 }}>{o.equipo_lugar}</span>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ ...chipStyle("verde"), background: "#0f766e" }}>CERRADA</span>
                </div>

                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Cerrada por: <b>{o.cerrado_por ?? "—"}</b>{" "}
                  {o.cerrado_en ? <>| Fecha: <b>{new Date(o.cerrado_en).toLocaleDateString()}</b></> : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.4fr",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      justifyContent: "center",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    {o.evidencia_url ? (
                      <button
                        type="button"
                        onClick={() => openZoom(o.evidencia_url || "", "Antes")}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          cursor: "zoom-in",
                          textAlign: "center",
                        }}
                      >
                        <img
                          src={o.evidencia_url}
                          alt="Antes"
                          style={{
                            width: 110,
                            height: 110,
                            objectFit: "cover",
                            borderRadius: 10,
                            border: "2px solid #ef4444",
                          }}
                        />
                        <div style={{ fontSize: 11, fontWeight: 900, color: "#ef4444", marginTop: 6 }}>
                          ANTES
                        </div>
                      </button>
                    ) : null}

                    {o.cierre_evidencia_url ? (
                      <button
                        type="button"
                        onClick={() => openZoom(o.cierre_evidencia_url || "", "Después")}
                        style={{
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          cursor: "zoom-in",
                          textAlign: "center",
                        }}
                      >
                        <img
                          src={o.cierre_evidencia_url}
                          alt="Después"
                          style={{
                            width: 110,
                            height: 110,
                            objectFit: "cover",
                            borderRadius: 10,
                            border: "2px solid #16a34a",
                          }}
                        />
                        <div style={{ fontSize: 11, fontWeight: 900, color: "#16a34a", marginTop: 6 }}>
                          DESPUÉS
                        </div>
                      </button>
                    ) : null}
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>Observación:</div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800 }}>{o.descripcion}</div>

                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        fontWeight: 800,
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                      }}
                    >
                      🛠 Trabajo realizado: {o.cierre_descripcion || "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Zoom Evidencia */}
      {zoomOpen && zoomUrl && (
        <div
          onClick={closeZoom}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 96vw)",
              background: "white",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900, color: "#0f172a" }}>{zoomLabel}</div>
              <div style={{ flex: 1 }} />
              <button
                onClick={closeZoom}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ padding: 12, background: "#0b1220" }}>
              <img
                src={zoomUrl}
                alt={zoomLabel}
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: "78vh",
                  objectFit: "contain",
                  borderRadius: 12,
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
