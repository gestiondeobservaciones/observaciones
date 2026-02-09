"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

type Perfil = {
  id: string;
  email: string;
  dni: string;
  nombre: string;
  rol: "admin" | "user";
};

type Obs = {
  id: string;
  estado: "pendiente" | "cerrada";
  responsable: string;
  area: string;
  equipo_lugar: string;
  categoria: "bajo" | "medio" | "alto";
  plazo: string; // puede venir YYYY-MM-DD o ISO o dd/mm/yyyy (lo soportamos)
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
  // a - b en días
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function getSemaforo(creadoEnISO: string, plazoStr: string): { sem: Semaforo; label: string } {
  const creado = new Date(creadoEnISO);
  const plazo = parsePlazoToDate(plazoStr);

  if (!plazo || Number.isNaN(creado.getTime())) {
    // si no se puede calcular, no rompemos UI
    return { sem: "amarillo", label: "Por vencer" };
  }

  const hoy = new Date();
  // normalizamos hora a medianoche para comparar “día”
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const plazo0 = new Date(plazo.getFullYear(), plazo.getMonth(), plazo.getDate());
  const creado0 = new Date(creado.getFullYear(), creado.getMonth(), creado.getDate());

  // vencido: vence hoy o ya pasó
  if (hoy0.getTime() >= plazo0.getTime()) {
    return { sem: "rojo", label: "Vencido" };
  }

  const total = Math.max(1, diffDays(plazo0, creado0)); // días asignados
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

export default function ObservacionesPage() {
  const [data, setData] = useState<Obs[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Perfil + rol
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilErr, setPerfilErr] = useState<string | null>(null);
  const [usuariosByEmail, setUsuariosByEmail] = useState<Record<string, string>>({});
  const isAdmin = perfil?.rol === "admin";

  // modal cerrar
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Obs | null>(null);
  const [closeDesc, setCloseDesc] = useState("");
  const [closeUrl, setCloseUrl] = useState("");
  const [closeFile, setCloseFile] = useState<File | null>(null);
  const [savingClose, setSavingClose] = useState(false);

  // modal zoom evidencia
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState<string>("");

  // delete (admin)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pendientes = useMemo(() => data.filter((d) => d.estado === "pendiente"), [data]);
  const cerradas = useMemo(() => data.filter((d) => d.estado === "cerrada"), [data]);

  async function loadPerfil() {
    setPerfilErr(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setPerfil(null);
      setPerfilErr("No hay sesión.");
      return;
    }

    const uid = session.user.id;

    const { data, error } = await supabase
      .from("usuarios")
      .select("id,email,dni,nombre,rol")
      .eq("id", uid)
      .single();

    if (error || !data) {
      setPerfil(null);
      setPerfilErr("No encuentro tu perfil en public.usuarios (id=auth.uid()).");
      return;
    }

    setPerfil(data as Perfil);
  }

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("observaciones")
      .select("*")
      .order("creado_en", { ascending: false });

    if (error) {
      alert("Error cargando: " + error.message);
      setData([]);
      setLoading(false);
      return;
    }

    const obs = (data ?? []) as Obs[];
    setData(obs);

    const cerradores = Array.from(
      new Set(obs.map((o) => o.cerrado_por).filter((v): v is string => !!v))
    );
    if (cerradores.length === 0) {
      setUsuariosByEmail({});
    } else {
      const { data: usuarios, error: usuariosErr } = await supabase
        .from("usuarios")
        .select("email,nombre")
        .in("email", cerradores);

      if (usuariosErr) {
        setUsuariosByEmail({});
      } else {
        const map: Record<string, string> = {};
        for (const u of usuarios ?? []) {
          if (u?.email) map[u.email] = u.nombre || u.email;
        }
        setUsuariosByEmail(map);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await loadPerfil();
      await load();
    })();
  }, []);

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

  function openCerrarModal(obs: Obs) {
    setCloseTarget(obs);
    setCloseDesc("");
    setCloseUrl("");
    setCloseFile(null);
    setCloseOpen(true);
  }

  async function uploadEvidencia(file: File) {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) throw new Error("Sesión inválida. Vuelve a iniciar sesión.");

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${user.id}/${Date.now()}_${safeName}`;

    const up = await supabase.storage.from("evidencias").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (up.error) throw new Error("Error subiendo evidencia: " + up.error.message);

    const pub = supabase.storage.from("evidencias").getPublicUrl(path);
    const publicUrl = pub.data.publicUrl;

    if (!publicUrl) throw new Error("No se pudo obtener URL pública del archivo.");
    return publicUrl;
  }

  async function confirmarCierre() {
    if (!closeTarget) return;

    const desc = closeDesc.trim();
    if (!desc) {
      alert("La descripción del trabajo es obligatoria.");
      return;
    }

    // Evidencia obligatoria: archivo o URL
    const hasFile = !!closeFile;
    const url = closeUrl.trim();
    const hasUrl = !!url;

    if (!hasFile && !hasUrl) {
      alert("La evidencia es obligatoria: sube un archivo o pega una URL.");
      return;
    }

    setSavingClose(true);

    try {
      let evidenciaFinal = url;

      if (hasFile && closeFile) {
        evidenciaFinal = await uploadEvidencia(closeFile);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email || "desconocido@observaciones.local";

      const { error } = await supabase
        .from("observaciones")
        .update({
          estado: "cerrada",
          cierre_descripcion: desc,
          cierre_evidencia_url: evidenciaFinal,
          cerrado_por: email,
          cerrado_en: new Date().toISOString(),
        })
        .eq("id", closeTarget.id);

      if (error) throw new Error(error.message);

      setCloseOpen(false);
      setCloseTarget(null);
      await load();
      alert("✅ Observación cerrada.");
    } catch (e: any) {
      alert("Error cerrando: " + (e?.message || String(e)));
    } finally {
      setSavingClose(false);
    }
  }

  async function eliminarCerrada(obs: Obs) {
    if (!isAdmin) {
      alert("No autorizado.");
      return;
    }
    if (obs.estado !== "cerrada") {
      alert("Solo se eliminan observaciones cerradas.");
      return;
    }

    const ok = confirm("¿Eliminar esta observación cerrada? Esta acción no se puede deshacer.");
    if (!ok) return;

    setDeletingId(obs.id);
    try {
      const { error } = await supabase.from("observaciones").delete().eq("id", obs.id);
      if (error) throw new Error(error.message);

      await load();
      alert("🗑️ Eliminada.");
    } catch (e: any) {
      alert("Error eliminando: " + (e?.message || String(e)));
    } finally {
      setDeletingId(null);
    }
  }

  const pageBg = "transparent"; // usar fondo global
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
          <div style={{ fontSize: 20, fontWeight: 900 }}>Observaciones</div>
          <div style={{ fontSize: 13, color: "#111827", fontWeight: 800, marginTop: 4 }}>
            👷‍♂️ Bienvenido{perfil?.nombre ? `, ${perfil.nombre}` : ""} ✅
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Pendientes: {pendientes.length} · Cerradas: {cerradas.length}
            {perfil?.rol ? (
              <>
                {" "}· Rol: <b style={{ color: "#111827" }}>{perfil.rol}</b>
              </>
            ) : null}
          </div>

          {perfilErr && (
            <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 6 }}>
              {perfilErr}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <Link
          href="/observaciones/nueva"
          style={{
            background: "#0ea5e9",
            color: "white",
            padding: "10px 14px",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 800,
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          ➕ Nueva observación
        </Link>

        <button
          onClick={async () => {
            await loadPerfil();
            await load();
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          🔄 Recargar
        </button>

        <button
          onClick={logout}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Salir
        </button>
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
                      border: "2px solid #f59e0b",
                      borderRadius: 14,
                      padding: 14,
                      background: "#ffffff",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 140px 1fr",
                        gap: 14,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 900 }}>
                          REPORTANTE: <span style={{ textTransform: "uppercase" }}>{o.responsable}</span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900 }}>
                          {o.area} · {o.equipo_lugar}
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          NIVEL DE RIESGO: <span style={{ color: "#0f172a" }}>{o.categoria}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          FECHA ESTIMADA:{" "}
                          <span style={{ color: "#0f172a" }}>{o.plazo}</span>
                        </div>
                      </div>

                      <div style={{ display: "grid", placeItems: "center" }}>
                        {o.evidencia_url ? (
                          <button
                            type="button"
                            onClick={() => openZoom(o.evidencia_url || "", "Evidencia")}
                            style={{
                              border: "2px solid #111827",
                              background: "white",
                              borderRadius: 10,
                              padding: 2,
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
                          <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>Observación:</div>
                          <div style={{ marginLeft: "auto" }}>
                            <Pill text={s.label} tone={pillTone} />
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{o.descripcion}</div>

                        <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => openCerrarModal(o)}
                            style={{
                              background: "#16a34a",
                              color: "white",
                              border: "1px solid #15803d",
                              padding: "6px 10px",
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            ✅ Cerrar
                          </button>

                          <button
                            type="button"
                            disabled
                            title="Ruta de edición no definida"
                            style={{
                              background: "#f8fafc",
                              color: "#64748b",
                              border: "1px solid #cbd5f5",
                              padding: "6px 10px",
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: 12,
                              cursor: "not-allowed",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            ✏️ Editar
                          </button>
                        </div>
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
            <div style={{ color: "#6b7280", fontSize: 13 }}>Aún no hay cerradas.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {cerradas.map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: "2px solid #f59e0b",
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
                        CERRADO POR:{" "}
                        <span style={{ textTransform: "uppercase" }}>
                          {usuariosByEmail[o.cerrado_por ?? ""] || o.cerrado_por || "-"}
                        </span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>
                        {o.area} · {o.equipo_lugar}
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
                            <button
                              type="button"
                              onClick={() => openZoom(o.evidencia_url || "", "Antes")}
                              style={{
                                position: "relative",
                                width: 120,
                                height: 120,
                                borderRadius: 12,
                                border: "2px solid #0f172a",
                                background: "white",
                                padding: 4,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
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
                              <div
                                style={{
                                  position: "absolute",
                                  bottom: 4,
                                  fontSize: 10,
                                  fontWeight: 900,
                                  color: "#ef4444",
                                }}
                              >
                                ANTES
                              </div>
                            </button>
                          )}

                          {o.cierre_evidencia_url && (
                            <button
                              type="button"
                              onClick={() => openZoom(o.cierre_evidencia_url || "", "Después")}
                              style={{                                position: "relative",                                width: 120,                                height: 120,                                borderRadius: 12,                                border: "2px solid #0f172a",                                background: "white",                                padding: 4,                                display: "inline-flex",                                alignItems: "center",                                justifyContent: "center",                              }}
                            >
                              <img
                                src={o.cierre_evidencia_url}
                                alt="Después"
                                style={{                                  width: 108,                                  height: 108,                                  borderRadius: 10,                                  objectFit: "cover",                                  display: "block",                                }}
                              />
                              <div                                style={{                                  position: "absolute",                                  bottom: 4,                                  fontSize: 10,                                  fontWeight: 900,                                  color: "#16a34a",                                }}                              >                                DESPUÉS                              </div>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Sin evidencia</div>
                      )}
                    </div>

                    <div className="min-w-0" style={{ display: "grid", gap: 8 }}>
                      <div className="flex items-center gap-2">
                        <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>Observación:</div>
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
                        🛠 Trabajo realizado: {o.cierre_descripcion || "—"}
                      </div>

                      {/* ✅ SOLO ADMIN: eliminar cerradas */}
                      {isAdmin && (
                        <button
                          onClick={() => eliminarCerrada(o)}
                          disabled={deletingId === o.id}
                          style={{
                            alignSelf: "flex-start",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            borderRadius: 8,
                            border: "1px solid #ef4444",
                            background: "#ef4444",
                            color: "white",
                            padding: "4px 8px",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: deletingId === o.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {deletingId === o.id ? "Eliminando..." : "Eliminar"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {/* Modal Cierre */}
      {closeOpen && (
        <div
          onClick={() => !savingClose && setCloseOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(680px, 100%)",
              background: "white",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", fontWeight: 900 }}>
              Cerrar observación (evidencia obligatoria)
            </div>

            <div style={{ padding: 14, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {closeTarget ? (
                  <>
                    <b>{closeTarget.area}</b> — {closeTarget.descripcion}
                  </>
                ) : null}
              </div>

              <label style={{ fontSize: 12, fontWeight: 800 }}>Descripción del trabajo realizado *</label>
              <textarea
                value={closeDesc}
                onChange={(e) => setCloseDesc(e.target.value)}
                placeholder="Ej: Se instaló guarda, se ajustó pernos, se limpió..."
                rows={4}
                style={{
                  width: "100%",
                  border: "1px solid #d1d5db",
                  borderRadius: 12,
                  padding: 12,
                  outline: "none",
                }}
              />

              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 800 }}>Evidencia (sube archivo) *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCloseFile(e.target.files?.[0] ?? null)}
                />
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Si subes imagen, se guarda en Storage (bucket: <b>evidencias</b>) y se registra la URL.
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 800 }}>o pega URL (si no subirás archivo)</label>
                <input
                  value={closeUrl}
                  onChange={(e) => setCloseUrl(e.target.value)}
                  placeholder="https://..."
                  style={{
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    padding: 12,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                padding: 14,
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <button
                disabled={savingClose}
                onClick={() => setCloseOpen(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "white",
                  fontWeight: 900,
                  cursor: savingClose ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>

              <button
                disabled={savingClose}
                onClick={confirmarCierre}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #15803d",
                  background: "#16a34a",
                  color: "white",
                  fontWeight: 900,
                  cursor: savingClose ? "not-allowed" : "pointer",
                }}
              >
                {savingClose ? "Cerrando..." : "✅ Confirmar cierre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



