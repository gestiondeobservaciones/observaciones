"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Obs = {
  id: string;
  estado: "pendiente" | "cerrada";
  responsable: string;
  area: string;
  equipo_lugar: string;
  categoria: "bajo" | "medio" | "alto";
  plazo: string; // puede venir YYYY-MM-DD o ISO o dd/mm/yyyy
  descripcion: string;
  evidencia_url: string | null;

  creado_por: string | null;
  creado_en: string; // ISO/timestamptz

  cierre_descripcion: string | null;
  cierre_evidencia_url: string | null;
  cerrado_por: string | null;
  cerrado_en: string | null;
};

type Semaforo = "verde" | "amarillo" | "rojo";

function getRiesgoColor(categoria: Obs["categoria"]) {
  if (categoria === "bajo") return "#16a34a";
  if (categoria === "alto") return "#ef4444";
  return "#f59e0b";
}

function parsePlazoToDate(plazo: string): Date | null {
  if (!plazo) return null;

  // Caso ISO o YYYY-MM-DD (Date lo entiende)
  const d1 = new Date(plazo);
  if (!Number.isNaN(d1.getTime())) return d1;

  // Caso dd/mm/yyyy
  const m = plazo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d2 = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(d2.getTime())) return d2;
  }

  return null;
}

function diffDays(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function getSemaforo(creadoEnISO: string, plazoStr: string): { sem: Semaforo; label: string } {
  const creado = new Date(creadoEnISO);
  const plazo = parsePlazoToDate(plazoStr);

  if (!plazo || Number.isNaN(creado.getTime())) {
    return { sem: "amarillo", label: "Por vencer" };
  }

  const hoy = new Date();
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const plazo0 = new Date(plazo.getFullYear(), plazo.getMonth(), plazo.getDate());
  const creado0 = new Date(creado.getFullYear(), creado.getMonth(), creado.getDate());

  if (hoy0.getTime() >= plazo0.getTime()) {
    return { sem: "rojo", label: "Vencido" };
  }

  const total = Math.max(1, diffDays(plazo0, creado0));
  const trans = Math.max(0, diffDays(hoy0, creado0));
  const ratio = trans / total;

  if (ratio >= 0.75) return { sem: "amarillo", label: "Por vencer" };
  return { sem: "verde", label: "En tiempo" };
}

function Pill({
  text,
  tone,
}: {
  text: string;
  tone: "green" | "yellow" | "red" | "gray" | "blue";
}) {
  const bg =
    tone === "green"
      ? "#16a34a"
      : tone === "yellow"
      ? "#f59e0b"
      : tone === "red"
      ? "#ef4444"
      : tone === "blue"
      ? "#2563eb"
      : "#6b7280";

  return (
    <span
      style={{
        background: bg,
        color: "white",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export default function PublicoPage() {
  const [data, setData] = useState<Obs[]>([]);
  const [loading, setLoading] = useState(true);

  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState<string>("");
  const [zoomTouchStartY, setZoomTouchStartY] = useState<number | null>(null);

  const pendientes = useMemo(() => data.filter((d) => d.estado === "pendiente"), [data]);
  const cerradas = useMemo(() => data.filter((d) => d.estado === "cerrada"), [data]);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("observaciones")
      .select("*")
      .order("creado_en", { ascending: false });

    if (error) {
      setData([]);
      setLoading(false);
      return;
    }

    setData((data ?? []) as Obs[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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

  const pageBg = "transparent";
  const cardBg = "white";

  if (loading) {
    return (
      <div style={{ padding: 20, background: pageBg, minHeight: "100vh" }}>
        <div
          style={{
            background: cardBg,
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          Cargando...
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: pageBg, minHeight: "100vh", padding: 16 }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto 12px",
          position: "relative",
        }}
      >
        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/Img/banner%20superior.png"
          alt="Banner superior"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: 12,
          }}
        />
        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/Img/volcan_seguro_rotacion_eje_vertical.gif"
          alt="Volc&aacute;n seguro"
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            width: "min(140px, 30vw)",
            height: "auto",
            display: "block",
          }}
        />
      </div>

      {/* Header */}
      <div
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          maxWidth: 1100,
          margin: "0 auto 14px auto",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(14,165,233,0.35)",
              background:
                "linear-gradient(90deg, rgba(14,165,233,0.18) 0%, rgba(99,102,241,0.18) 50%, rgba(34,197,94,0.18) 100%)",
              boxShadow: "0 8px 20px rgba(14,165,233,0.25)",
              fontFamily: "Sora, Segoe UI, sans-serif",
              fontWeight: 900,
              fontSize: 20,
              color: "#0f172a",
            }}
          >
            Observaciones
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Vista p&uacute;blica &middot; Pendientes: {pendientes.length} &middot; Cerradas:{" "}
            {cerradas.length}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/login"
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid rgba(37,99,235,0.45)",
              background:
                "linear-gradient(90deg, rgba(37,99,235,0.15) 0%, rgba(14,165,233,0.22) 50%, rgba(16,185,129,0.15) 100%)",
              color: "#0f172a",
              fontWeight: 900,
              letterSpacing: 0.2,
              boxShadow: "0 10px 22px rgba(37,99,235,0.25)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            &#128274; Iniciar sesi&oacute;n
          </Link>

          <button
            onClick={load}
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid rgba(37,99,235,0.35)",
              background:
                "linear-gradient(90deg, rgba(15,23,42,0.06) 0%, rgba(14,165,233,0.12) 50%, rgba(16,185,129,0.1) 100%)",
              color: "#0f172a",
              fontWeight: 900,
              letterSpacing: 0.2,
              boxShadow: "0 10px 22px rgba(37,99,235,0.18)",
              cursor: "pointer",
            }}
          >
            &#128257; Recargar
          </button>
        </div>
      </div>

      {/* Listado */}
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 14 }}>
        {/* Pendientes */}
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>
            Pendientes ({pendientes.length})
          </div>

          {pendientes.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No hay pendientes.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {pendientes.map((o) => {
                const s = getSemaforo(o.creado_en, o.plazo);
                const pillTone = s.sem === "verde" ? "green" : s.sem === "amarillo" ? "yellow" : "red";

                return (
                  <div
                    key={o.id}
                    style={{
                      border: `2px solid ${getRiesgoColor(o.categoria)}`,
                      borderRadius: 14,
                      padding: 14,
                      background: "#ffffff",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 120px 1fr",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 900 }}>
                          REPORTANTE: <span style={{ textTransform: "uppercase" }}>{o.responsable}</span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900 }}>
                          {o.area} &middot; {o.equipo_lugar}
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          NIVEL DE RIESGO: <span style={{ color: "#0f172a" }}>{o.categoria}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          FECHA ESTIMADA: <span style={{ color: "#0f172a" }}>{o.plazo}</span>
                        </div>
                      </div>

                      <div style={{ display: "grid", placeItems: "center" }}>
                        {o.evidencia_url ? (
                          <button
                            type="button"
                            onClick={() => openZoom(o.evidencia_url || "", "Evidencia")}
                            style={{
                              border: "1px solid rgba(14,165,233,0.45)",
                              background:
                                "linear-gradient(90deg, rgba(14,165,233,0.18) 0%, rgba(99,102,241,0.18) 50%, rgba(34,197,94,0.18) 100%)",
                              boxShadow: "0 8px 20px rgba(14,165,233,0.25)",
                              borderRadius: 14,
                              padding: 3,
                              cursor: "zoom-in",
                            }}
                          >
                            <img
                              src={o.evidencia_url}
                              alt="Evidencia"
                              style={{
                                width: 110,
                                height: 110,
                                objectFit: "cover",
                                borderRadius: 8,
                              }}
                            />
                          </button>
                        ) : (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>Sin evidencia</div>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>Observaci&oacute;n:</div>
                          <div style={{ marginLeft: "auto" }}>
                            <Pill text={s.label} tone={pillTone} />
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{o.descripcion}</div>
                      </div>
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
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>
            Cerradas ({cerradas.length})
          </div>

          {cerradas.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>A&uacute;n no hay cerradas.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {cerradas.map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: `2px solid ${getRiesgoColor(o.categoria)}`,
                    borderRadius: 14,
                    padding: 14,
                    background: "#ffffff",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "320px 240px 1fr",
                      gap: 16,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ width: 320, display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 900 }}>
                        CERRADO POR: <span style={{ textTransform: "uppercase" }}>{o.cerrado_por || "-"}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>
                        {o.area} &middot; {o.equipo_lugar}
                      </div>
                      <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                        NIVEL DE RIESGO: <span style={{ color: "#0f172a" }}>{o.categoria}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                        FECHA DE CIERRE:{" "}
                        <span style={{ color: "#0f172a" }}>
                          {o.cerrado_en ? new Date(o.cerrado_en).toLocaleDateString() : "-"}
                        </span>
                      </div>
                    </div>

                    <div style={{ width: 240 }}>
                      {o.evidencia_url || o.cierre_evidencia_url ? (
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 10 }}>
                          {o.evidencia_url && (
                            <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => openZoom(o.evidencia_url || "", "Antes")}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 14,
                                  border: "1px solid rgba(14,165,233,0.45)",
                                  background:
                                    "linear-gradient(90deg, rgba(14,165,233,0.18) 0%, rgba(99,102,241,0.18) 50%, rgba(34,197,94,0.18) 100%)",
                                  boxShadow: "0 8px 20px rgba(14,165,233,0.25)",
                                  padding: 4,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "zoom-in",
                                }}
                              >
                                <img
                                  src={o.evidencia_url}
                                  alt="Antes"
                                  style={{
                                    width: 108,
                                    height: 108,
                                    borderRadius: 10,
                                    objectFit: "cover",
                                    display: "block",
                                  }}
                                />
                              </button>
                              <div style={{ fontSize: 10, fontWeight: 900, color: "#ef4444" }}>ANTES</div>
                            </div>
                          )}

                          {o.cierre_evidencia_url && (
                            <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => openZoom(o.cierre_evidencia_url || "", "Despu&eacute;s")}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 14,
                                  border: "1px solid rgba(14,165,233,0.45)",
                                  background:
                                    "linear-gradient(90deg, rgba(14,165,233,0.18) 0%, rgba(99,102,241,0.18) 50%, rgba(34,197,94,0.18) 100%)",
                                  boxShadow: "0 8px 20px rgba(14,165,233,0.25)",
                                  padding: 4,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "zoom-in",
                                }}
                              >
                                <img
                                  src={o.cierre_evidencia_url}
                                  alt="Despu&eacute;s"
                                  style={{
                                    width: 108,
                                    height: 108,
                                    borderRadius: 10,
                                    objectFit: "cover",
                                    display: "block",
                                  }}
                                />
                              </button>
                              <div style={{ fontSize: 10, fontWeight: 900, color: "#16a34a" }}>
                                DESPU&Eacute;S
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Sin evidencia</div>
                      )}
                    </div>

                    <div className="min-w-0" style={{ display: "grid", gap: 8 }}>
                      <div className="flex items-center gap-2">
                        <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>Observaci&oacute;n:</div>
                        <div className="ml-auto flex items-center gap-2">
                          <Pill text="Cerrada" tone="gray" />
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{o.descripcion}</div>

                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          fontWeight: 800,
                          background: "#f8fafc",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        &#128736; Trabajo realizado: {o.cierre_descripcion || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ margin: "22px auto 0", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            background: "white",
            border: "2px solid #2563eb",
            borderRadius: 999,
            padding: "10px 18px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 24px rgba(37,99,235,0.2)",
          }}
        >
          <img
            src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/la%20seguridad.png"
            alt="La seguridad"
            style={{
              width: "min(520px, 86vw)",
              height: "auto",
              display: "block",
            }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "18px auto 0" }}>
        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/Img/banner%20inferior.png"
          alt="Banner inferior"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: 12,
          }}
        />
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
            onTouchStart={(e) => setZoomTouchStartY(e.touches[0]?.clientY ?? null)}
            onTouchEnd={(e) => {
              if (zoomTouchStartY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? zoomTouchStartY;
              if (endY - zoomTouchStartY > 80) closeZoom();
              setZoomTouchStartY(null);
            }}
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
