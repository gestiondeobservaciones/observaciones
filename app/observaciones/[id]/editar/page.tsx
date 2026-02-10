"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AREAS, CATEGORIAS } from "@/lib/constants";
import styles from "../../nueva/page.module.css";

type Perfil = {
  id: string; // uid
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
  plazo: string;
  descripcion: string;
  evidencia_url: string | null;
};

export default function EditarObservacionPage() {
  const router = useRouter();
  const params = useParams();
  const obsId = String(params?.id || "");

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilError, setPerfilError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [area, setArea] = useState<string>(AREAS[0] || "chancado");
  const [equipoLugar, setEquipoLugar] = useState("");
  const [categoria, setCategoria] = useState<"bajo" | "medio" | "alto">("medio");
  const [plazo, setPlazo] = useState(""); // YYYY-MM-DD
  const [descripcion, setDescripcion] = useState("");
  const [responsable, setResponsable] = useState("");

  // Evidencia
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const responsableNombre = useMemo(() => responsable || perfil?.nombre || "", [responsable, perfil]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setPerfilError(null);

      const { data: sessionRes } = await supabase.auth.getSession();
      const session = sessionRes.session;

      if (!session) {
        router.push(`/login?next=/observaciones/${obsId}/editar`);
        return;
      }

      const uid = session.user.id;
      const { data: perfilData, error: perfilErr } = await supabase
        .from("usuarios")
        .select("id,email,dni,nombre,rol")
        .eq("id", uid)
        .single();

      if (perfilErr || !perfilData) {
        const errMsg = perfilErr?.message || "";
        if (errMsg.toLowerCase().includes("jwt expired")) {
          await supabase.auth.signOut();
          router.push(`/login?next=/observaciones/${obsId}/editar`);
          return;
        }
        setPerfil(null);
        setPerfilError(
          "No encuentro tu perfil en public.usuarios. " +
            (perfilErr?.message ? `Detalle: ${perfilErr.message}` : "")
        );
        setLoading(false);
        return;
      }
      setPerfil(perfilData as Perfil);

      const { data: obs, error: obsErr } = await supabase
        .from("observaciones")
        .select("id,estado,responsable,area,equipo_lugar,categoria,plazo,descripcion,evidencia_url")
        .eq("id", obsId)
        .single();

      if (obsErr || !obs) {
        alert("No se pudo cargar la observación.");
        router.push("/observaciones");
        return;
      }

      if (obs.estado !== "pendiente") {
        alert("Solo se pueden editar observaciones pendientes.");
        router.push("/observaciones");
        return;
      }

      setResponsable(obs.responsable || "");
      setArea(obs.area || (AREAS[0] || "chancado"));
      setEquipoLugar(obs.equipo_lugar || "");
      setCategoria((obs.categoria as any) || "medio");
      setPlazo(obs.plazo || "");
      setDescripcion(obs.descripcion || "");
      setCurrentUrl(obs.evidencia_url || null);

      setLoading(false);
    })();
  }, [router, obsId]);

  async function subirArchivoSiExiste() {
    if (!file) return null;

    setUploading(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const session = sessionRes.session;
      if (!session) throw new Error("Sesión no encontrada");

      const uid = session.user.id;
      const ext = file.name.split(".").pop() || "jpg";
      const safeExt = ext.toLowerCase();
      const fileName = `${uid}/${Date.now()}.${safeExt}`;

      const { error: upErr } = await supabase.storage
        .from("evidencias")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        });

      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("evidencias").getPublicUrl(fileName);
      const url = pub.publicUrl;
      setUploadUrl(url);
      return url;
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil) return;

    if (!equipoLugar.trim()) {
      alert("Completa Equipo / Lugar.");
      return;
    }
    if (!plazo) {
      alert("Selecciona Plazo (fecha).");
      return;
    }
    if (!descripcion.trim()) {
      alert("Completa la descripción.");
      return;
    }

    setSaving(true);
    try {
      const newUrl = await subirArchivoSiExiste();
      const evidenciaFinal = newUrl ?? currentUrl ?? null;

      const payload = {
        area,
        equipo_lugar: equipoLugar.trim(),
        categoria,
        plazo,
        descripcion: descripcion.trim(),
        evidencia_url: evidenciaFinal,
      };

      const { error } = await supabase.from("observaciones").update(payload).eq("id", obsId);
      if (error) {
        alert("Error guardando: " + error.message);
        return;
      }

      router.push("/observaciones");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/observaciones" className={styles.backLink}>
          ← Volver
        </Link>
        <h1 className={styles.title}>Editar observación</h1>

        {perfilError && <div className={styles.errorBox}>{perfilError}</div>}

        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/volcan%20seguro.png"
          alt="Volcán seguro"
          className={styles.emblem}
        />

        <div className={styles.card}>
          <form onSubmit={onSubmit} className={styles.form}>
            <div className={styles.twoCol}>
              <label className={styles.field}>
                <span className={styles.label}>Responsable</span>
                <input value={responsableNombre} disabled className={`${styles.input} ${styles.disabled}`} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Área</span>
                <select value={area} onChange={(e) => setArea(e.target.value)} className={styles.input}>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.twoCol}>
              <label className={styles.field}>
                <span className={styles.label}>Equipo / Lugar</span>
                <input
                  value={equipoLugar}
                  onChange={(e) => setEquipoLugar(e.target.value)}
                  placeholder="Ej: faja 8"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Categoría</span>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as any)}
                  className={styles.input}
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.twoCol}>
              <label className={styles.field}>
                <span className={styles.label}>Plazo</span>
                <input type="date" value={plazo} onChange={(e) => setPlazo(e.target.value)} className={styles.input} />
              </label>
              <div className={styles.spacer} />
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Descripción</span>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe la observación..."
                rows={5}
                className={`${styles.input} ${styles.textarea}`}
              />
            </label>

            <div className={styles.evidenceBlock}>
              <div className={styles.evidenceTitle}>Evidencia (archivo opcional)</div>
              {currentUrl && (
                <div className={styles.helperText}>
                  Actual:{" "}
                  <a href={currentUrl} target="_blank" rel="noreferrer" className={styles.linkInline}>
                    Ver evidencia
                  </a>
                </div>
              )}
              {currentUrl && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    style={{
                      border: "2px solid #0f172a",
                      borderRadius: 10,
                      padding: 4,
                      background: "white",
                      cursor: "zoom-in",
                      display: "inline-flex",
                    }}
                  >
                    <img
                      src={currentUrl}
                      alt="Evidencia actual"
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: "cover",
                        borderRadius: 8,
                      }}
                    />
                  </button>
                </div>
              )}

              <div className={styles.fileRow}>
                <input
                  id="evidencia-file"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className={styles.fileInput}
                />
                <label htmlFor="evidencia-file" className={styles.fileButton}>
                  Seleccionar archivo
                </label>
                <span className={styles.fileName}>{file ? file.name : "Ningún archivo seleccionado"}</span>
              </div>

              <div className={styles.helperText}>
                Si subes una imagen, se guarda en Storage (bucket: <b>evidencias</b>) y se actualiza la URL.
              </div>

              {uploadUrl && (
                <div className={styles.helperText}>
                  ✅ URL generada:{" "}
                  <a href={uploadUrl} target="_blank" rel="noreferrer" className={styles.linkInline}>
                    Ver
                  </a>
                </div>
              )}
            </div>

            <button type="submit" disabled={!perfil || saving || uploading} className={styles.submit}>
              {uploading ? "Subiendo..." : saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </div>

        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/la%20seguridad.png"
          alt="La seguridad"
          className={styles.footerImage}
        />
      </div>

      {zoomOpen && currentUrl && (
        <div
          onClick={() => setZoomOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => setTouchStartY(e.touches[0]?.clientY ?? null)}
            onTouchEnd={(e) => {
              if (touchStartY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? touchStartY;
              if (endY - touchStartY > 80) setZoomOpen(false);
              setTouchStartY(null);
            }}
            style={{
              width: "min(680px, 92vw)",
              background: "white",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 18px 50px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                padding: 10,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900, color: "#0f172a" }}>Evidencia</div>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setZoomOpen(false)}
                style={{
                  padding: "6px 10px",
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
            <div style={{ padding: 10, background: "#0b1220" }}>
              <img
                src={currentUrl}
                alt="Evidencia"
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  display: "block",
                  borderRadius: 12,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
