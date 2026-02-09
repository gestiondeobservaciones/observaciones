"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AREAS, CATEGORIAS } from "@/lib/constants";
import styles from "./page.module.css";

type Perfil = {
  id: string; // uid
  email: string;
  dni: string;
  nombre: string;
  rol: "admin" | "user";
};

export default function NuevaObservacionPage() {
  const router = useRouter();

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilError, setPerfilError] = useState<string | null>(null);

  const [loadingPerfil, setLoadingPerfil] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [area, setArea] = useState<string>(AREAS[0] || "chancado");
  const [equipoLugar, setEquipoLugar] = useState("");
  const [categoria, setCategoria] = useState<"bajo" | "medio" | "alto">("medio");
  const [plazo, setPlazo] = useState(""); // YYYY-MM-DD
  const [descripcion, setDescripcion] = useState("");

  // Evidencia
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);

  const responsableNombre = useMemo(() => perfil?.nombre || "", [perfil]);

  useEffect(() => {
    (async () => {
      setLoadingPerfil(true);
      setPerfilError(null);

      const { data: sessionRes } = await supabase.auth.getSession();
      const session = sessionRes.session;

      if (!session) {
        router.push("/login?next=/observaciones/nueva");
        return;
      }

      const uid = session.user.id;

      const { data, error } = await supabase
        .from("usuarios")
        .select("id,email,dni,nombre,rol")
        .eq("id", uid)
        .single();

      if (error || !data) {
        const errMsg = error?.message || "";
        console.log("perfil error:", error);
        console.log("perfil data:", data);

        // Si el JWT expiró, forzamos re-login
        if (errMsg.toLowerCase().includes("jwt expired")) {
          await supabase.auth.signOut();
          router.push("/login?next=/observaciones/nueva");
          return;
        }

        setPerfil(null);
        setPerfilError(
          "No encuentro tu perfil en public.usuarios. " +
            (error?.message ? `Detalle: ${error.message}` : "")
        );
      } else {
        setPerfil(data as Perfil);
      }


      setLoadingPerfil(false);
    })();
  }, [router]);

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
      const evidenciaUrl = await subirArchivoSiExiste();

      const { data: sessionRes } = await supabase.auth.getSession();
      const session = sessionRes.session!;
      const email = session.user.email || `${perfil.dni}@observaciones.local`;

      const payload = {
        estado: "pendiente",
        responsable: perfil.nombre, // ✅ automático
        area,
        equipo_lugar: equipoLugar.trim(),
        categoria,
        plazo, // YYYY-MM-DD
        descripcion: descripcion.trim(),
        evidencia_url: evidenciaUrl ?? null,
        creado_por: email,
        creado_en: new Date().toISOString(),
      };

      const { error } = await supabase.from("observaciones").insert(payload);

      if (error) {
        alert("Error guardando: " + error.message);
        return;
      }

      router.push("/observaciones");
    } finally {
      setSaving(false);
    }
  }

  if (loadingPerfil) return <p style={{ padding: 20 }}>Cargando perfil...</p>;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/observaciones" className={styles.backLink}>
          ← Volver
        </Link>
        <h1 className={styles.title}>Nueva observación</h1>

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
                <span className={styles.label}>Responsable (auto)</span>
                <input value={responsableNombre} disabled className={`${styles.input} ${styles.disabled}`} />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Área</span>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className={styles.input}
                >
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
                <input
                  type="date"
                  value={plazo}
                  onChange={(e) => setPlazo(e.target.value)}
                  className={styles.input}
                />
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
                <span className={styles.fileName}>
                  {file ? file.name : "Ningún archivo seleccionado"}
                </span>
              </div>

              <div className={styles.helperText}>
                Si subes una imagen, se guarda en Storage (bucket: <b>evidencias</b>) y se registra la URL.
              </div>

              {file && (
                <div className={styles.helperText}>
                  Archivo: <b>{file.name}</b>
                </div>
              )}

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
              {uploading ? "Subiendo..." : saving ? "Guardando..." : "Guardar"}
            </button>
          </form>
        </div>

        <img
          src="https://whxeijdmxfteizyabtwi.supabase.co/storage/v1/object/public/assets/fondos/la%20seguridad.png"
          alt="La seguridad"
          className={styles.footerImage}
        />

      </div>
    </main>
  );
}
