"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import { AREAS, CATEGORIAS } from "@/lib/constants";
import ThumbImage from "@/components/ThumbImage";
import styles from "./nueva/page.module.css";

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

function formatDateDMY(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getPlazoEstimadoDias(creadoEnISO: string, plazoStr: string) {
  const creado = new Date(creadoEnISO);
  const plazo = parsePlazoToDate(plazoStr);
  if (!plazo || Number.isNaN(creado.getTime())) return "-";

  const plazo0 = new Date(plazo.getFullYear(), plazo.getMonth(), plazo.getDate());
  const creado0 = new Date(creado.getFullYear(), creado.getMonth(), creado.getDate());
  return String(Math.max(0, diffDays(plazo0, creado0)));
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
  const actorEmail = useMemo(() => {
    const fallback = perfil?.dni ? `${perfil.dni}@observaciones.local` : "";
    return (perfil?.email || fallback).trim().toLowerCase();
  }, [perfil?.email, perfil?.dni]);

  // modal cerrar
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Obs | null>(null);
  const [closeDesc, setCloseDesc] = useState("");
  const [closeFile, setCloseFile] = useState<File | null>(null);
  const [savingClose, setSavingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeInvalid, setCloseInvalid] = useState<{ desc: boolean; evidencia: boolean }>({
    desc: false,
    evidencia: false,
  });

  // modal nueva
  const [newOpen, setNewOpen] = useState(false);
  const [newArea, setNewArea] = useState<string>(AREAS[0] || "chancado");
  const [newEquipoLugar, setNewEquipoLugar] = useState("");
  const [newCategoria, setNewCategoria] = useState<Obs["categoria"]>("medio");
  const [newPlazo, setNewPlazo] = useState("");
  const [newDescripcion, setNewDescripcion] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newUploading, setNewUploading] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newUploadUrl, setNewUploadUrl] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [newInvalid, setNewInvalid] = useState<{ equipo: boolean; plazo: boolean; desc: boolean; evidencia: boolean }>({
    equipo: false,
    plazo: false,
    desc: false,
    evidencia: false,
  });

  // modal editar
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Obs | null>(null);
  const [editArea, setEditArea] = useState<string>(AREAS[0] || "chancado");
  const [editEquipoLugar, setEditEquipoLugar] = useState("");
  const [editCategoria, setEditCategoria] = useState<Obs["categoria"]>("medio");
  const [editPlazo, setEditPlazo] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editResponsable, setEditResponsable] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editCurrentUrl, setEditCurrentUrl] = useState<string | null>(null);
  const [editUploadUrl, setEditUploadUrl] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editInvalid, setEditInvalid] = useState<{ equipo: boolean; plazo: boolean; desc: boolean; evidencia: boolean }>({
    equipo: false,
    plazo: false,
    desc: false,
    evidencia: false,
  });

  const newEquipoRef = useRef<HTMLInputElement | null>(null);
  const editEquipoRef = useRef<HTMLInputElement | null>(null);
  const closeDescRef = useRef<HTMLTextAreaElement | null>(null);

  // modal zoom evidencia
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState<string>("");
  const [zoomTouchStartY, setZoomTouchStartY] = useState<number | null>(null);

  // delete (admin)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pendientes = useMemo(() => data.filter((d) => d.estado === "pendiente"), [data]);
  const cerradas = useMemo(() => data.filter((d) => d.estado === "cerrada"), [data]);
  const PAGE_SIZE = 20;
  const [pendientesLimit, setPendientesLimit] = useState(PAGE_SIZE);
  const [cerradasLimit, setCerradasLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setPendientesLimit(PAGE_SIZE);
    setCerradasLimit(PAGE_SIZE);
  }, [data.length]);

  function isOwner(obs: Obs | null) {
    if (!obs) return false;
    return (obs.creado_por || "").trim().toLowerCase() === actorEmail;
  }

  function canEdit(obs: Obs | null) {
    return isAdmin || isOwner(obs);
  }

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

  async function syncSheets(payload: unknown) {
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) msg = String(data.error);
        } catch {
          // ignore parse errors and keep HTTP status
        }
        console.error("Sheets sync failed:", msg);
      }
    } catch (err) {
      console.error("Sheets sync request failed:", err);
    }
  }

  useEffect(() => {
    (async () => {
      await loadPerfil();
      await load();
    })();
  }, []);

  useEffect(() => {
    if (!newOpen && !editOpen && !closeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (closeOpen && !savingClose) setCloseOpen(false);
      if (editOpen && !savingEdit && !editUploading) setEditOpen(false);
      if (newOpen && !savingNew && !newUploading) setNewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newOpen, editOpen, closeOpen, savingClose, savingEdit, editUploading, savingNew, newUploading]);

  useEffect(() => {
    if (newOpen) newEquipoRef.current?.focus();
  }, [newOpen]);

  useEffect(() => {
    if (editOpen) editEquipoRef.current?.focus();
  }, [editOpen]);

  useEffect(() => {
    if (closeOpen) closeDescRef.current?.focus();
  }, [closeOpen]);

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
    setCloseFile(null);
    setCloseError(null);
    setCloseInvalid({ desc: false, evidencia: false });
    setCloseOpen(true);
  }

  function openNuevaModal() {
    setNewArea(AREAS[0] || "chancado");
    setNewEquipoLugar("");
    setNewCategoria("medio");
    setNewPlazo("");
    setNewDescripcion("");
    setNewFile(null);
    setNewUploadUrl(null);
    setNewError(null);
    setNewInvalid({ equipo: false, plazo: false, desc: false, evidencia: false });
    setNewOpen(true);
  }

  function openEditarModal(obs: Obs) {
    if (!canEdit(obs)) {
      alert("Solo el creador o un admin puede editar la observación.");
      return;
    }
    setEditTarget(obs);
    setEditResponsable(obs.responsable || "");
    setEditArea(obs.area || (AREAS[0] || "chancado"));
    setEditEquipoLugar(obs.equipo_lugar || "");
    setEditCategoria(obs.categoria || "medio");
    setEditPlazo(obs.plazo || "");
    setEditDescripcion(obs.descripcion || "");
    setEditCurrentUrl(obs.evidencia_url || null);
    setEditFile(null);
    setEditUploadUrl(null);
    setEditError(null);
    setEditInvalid({ equipo: false, plazo: false, desc: false, evidencia: false });
    setEditOpen(true);
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

  async function subirArchivoNuevo() {
    if (!newFile) return null;
    setNewUploading(true);
    try {
      const url = await uploadEvidencia(newFile);
      setNewUploadUrl(url);
      return url;
    } finally {
      setNewUploading(false);
    }
  }

  async function subirArchivoEditar() {
    if (!editFile) return null;
    setEditUploading(true);
    try {
      const url = await uploadEvidencia(editFile);
      setEditUploadUrl(url);
      return url;
    } finally {
      setEditUploading(false);
    }
  }

  async function guardarNueva(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil) return;

    setNewError(null);
    setNewInvalid({ equipo: false, plazo: false, desc: false, evidencia: false });

    if (!newEquipoLugar.trim()) {
      setNewError("Completa los campos obligatorios.");
      setNewInvalid({ equipo: true, plazo: false, desc: false, evidencia: false });
      newEquipoRef.current?.focus();
      return;
    }
    if (!newPlazo) {
      setNewError("Selecciona el plazo.");
      setNewInvalid({ equipo: false, plazo: true, desc: false, evidencia: false });
      return;
    }
    if (!newDescripcion.trim()) {
      setNewError("Completa la descripción.");
      setNewInvalid({ equipo: false, plazo: false, desc: true, evidencia: false });
      return;
    }
    if (!newFile) {
      setNewError("La evidencia es obligatoria.");
      setNewInvalid({ equipo: false, plazo: false, desc: false, evidencia: true });
      return;
    }

    setSavingNew(true);
    try {
      const evidenciaUrl = await subirArchivoNuevo();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email || `${perfil.dni}@observaciones.local`;

      const payload = {
        estado: "pendiente",
        responsable: perfil.nombre,
        area: newArea,
        equipo_lugar: newEquipoLugar.trim(),
        categoria: newCategoria,
        plazo: newPlazo,
        descripcion: newDescripcion.trim(),
        evidencia_url: evidenciaUrl ?? null,
        creado_por: email,
        creado_en: new Date().toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from("observaciones")
        .insert(payload)
        .select("*")
        .single();
      if (error || !inserted) {
        alert("Error guardando: " + (error?.message || "No se pudo crear la observación."));
        return;
      }

      await syncSheets({ action: "create", data: inserted });

      setNewOpen(false);
      await load();
    } finally {
      setSavingNew(false);
    }
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (!canEdit(editTarget)) {
      alert("Solo el creador o un admin puede editar la observación.");
      return;
    }
    if (!isAdmin && !actorEmail) {
      alert("No se pudo validar el usuario actual. Vuelve a iniciar sesión.");
      return;
    }

    setEditError(null);
    setEditInvalid({ equipo: false, plazo: false, desc: false, evidencia: false });

    if (!editEquipoLugar.trim()) {
      setEditError("Completa los campos obligatorios.");
      setEditInvalid({ equipo: true, plazo: false, desc: false, evidencia: false });
      editEquipoRef.current?.focus();
      return;
    }
    if (!editPlazo) {
      setEditError("Selecciona el plazo.");
      setEditInvalid({ equipo: false, plazo: true, desc: false, evidencia: false });
      return;
    }
    if (!editDescripcion.trim()) {
      setEditError("Completa la descripción.");
      setEditInvalid({ equipo: false, plazo: false, desc: true, evidencia: false });
      return;
    }
    // En edición debe existir evidencia final: la actual o un nuevo archivo.
    if (!editCurrentUrl && !editFile) {
      setEditError("La evidencia es obligatoria.");
      setEditInvalid({ equipo: false, plazo: false, desc: false, evidencia: true });
      return;
    }

    setSavingEdit(true);
    try {
      const newUrl = await subirArchivoEditar();
      const evidenciaFinal = newUrl ?? editCurrentUrl ?? null;

      const payload = {
        area: editArea,
        equipo_lugar: editEquipoLugar.trim(),
        categoria: editCategoria,
        plazo: editPlazo,
        descripcion: editDescripcion.trim(),
        evidencia_url: evidenciaFinal,
      };

      const baseUpdate = supabase.from("observaciones").update(payload).eq("id", editTarget.id).select("id");
      const query = isAdmin ? baseUpdate : baseUpdate.eq("creado_por", actorEmail);
      const { data: updated, error } = await query.maybeSingle();
      if (error) {
        alert("Error guardando: " + error.message);
        return;
      }
      if (!updated) {
        alert("No autorizado: solo el creador o un admin puede editarla.");
        return;
      }

      await syncSheets({
        action: "edit",
        data: {
          id: editTarget.id,
          estado: editTarget.estado,
          responsable: editTarget.responsable,
          area: editArea,
          equipo_lugar: editEquipoLugar.trim(),
          categoria: editCategoria,
          plazo: editPlazo,
          descripcion: editDescripcion.trim(),
          creado_por: editTarget.creado_por ?? "",
          creado_en: editTarget.creado_en,
        },
      });

      setEditOpen(false);
      setEditTarget(null);
      await load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmarCierre() {
    if (!closeTarget) return;

    setCloseError(null);
    setCloseInvalid({ desc: false, evidencia: false });

    const desc = closeDesc.trim();
    if (!desc) {
      setCloseError("La descripción del trabajo es obligatoria.");
      setCloseInvalid({ desc: true, evidencia: false });
      closeDescRef.current?.focus();
      return;
    }

    // Evidencia obligatoria: archivo
    const hasFile = !!closeFile;

    if (!hasFile) {
      setCloseError("La evidencia es obligatoria: sube un archivo.");
      setCloseInvalid({ desc: false, evidencia: true });
      return;
    }

    setSavingClose(true);

    try {
      let evidenciaFinal = "";

      if (hasFile && closeFile) {
        evidenciaFinal = await uploadEvidencia(closeFile);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email || "desconocido@observaciones.local";

      const { data: updated, error } = await supabase
        .from("observaciones")
        .update({
          estado: "cerrada",
          cierre_descripcion: desc,
          cierre_evidencia_url: evidenciaFinal,
          cerrado_por: email,
          cerrado_en: new Date().toISOString(),
        })
        .eq("id", closeTarget.id)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!updated) throw new Error("No autorizado para cerrar esta observación.");

      await syncSheets({
        action: "close",
        data: {
          id: closeTarget.id,
          estado: "cerrada",
          responsable: closeTarget.responsable,
          area: closeTarget.area,
          equipo_lugar: closeTarget.equipo_lugar,
          categoria: closeTarget.categoria,
          plazo: closeTarget.plazo,
          descripcion: closeTarget.descripcion,
          creado_por: closeTarget.creado_por ?? "",
          creado_en: closeTarget.creado_en,
          cerrado_por: email,
          cerrado_en: new Date().toISOString(),
          cierre_descripcion: desc,
        },
      });

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

  const pageBg =
    'url("https://satljniaasognjpuncel.supabase.co/storage/v1/object/public/assets/fondos/fondo%20cerro.jpg")';
  const cardBg = "white";

  if (loading) {
    return (
      <div
        style={{
          padding: 20,
          background: pageBg,
          minHeight: "100vh",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
        }}
      >
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
    <div
      style={{
        background: pageBg,
        minHeight: "100vh",
        padding: 16,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
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
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 0.6,
              color: "#0b1220",
              textTransform: "uppercase",
              textShadow: "0 2px 0 rgba(255,255,255,0.6), 0 10px 24px rgba(15,23,42,0.25)",
            }}
          >
            GESTION DE OBSERVACIONES
          </div>
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
              marginTop: 4,
            }}
          >
            👷‍♂️ Bienvenido{perfil?.nombre ? `, ${perfil.nombre}` : ""} 👋
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

        <button
          onClick={openNuevaModal}
          style={{
            background: "#0ea5e9",
            color: "white",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.12)",
            fontWeight: 800,
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          ➕ Nueva observación
        </button>

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

        <a
          href="/dashboard"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #0ea5e9",
            background: "#0ea5e9",
            color: "white",
            fontWeight: 900,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          📊 Dashboard
        </a>
      </div>

      {/* Listado */}
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 14 }}>
        {/* Pendientes */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.35)",
            border: "1px solid rgba(148, 163, 184, 0.45)",
            borderRadius: 14,
            padding: 14,
            boxShadow: "0 20px 50px rgba(2, 6, 23, 0.35)",
            backdropFilter: "blur(8px)",
            outline: "1px solid rgba(148, 163, 184, 0.15)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, color: "#e2e8f0" }}>
            Pendientes ({pendientes.length})
          </div>

          {pendientes.length === 0 ? (
            <div style={{ color: "#cbd5f5", fontSize: 13 }}>No hay pendientes.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {pendientes.slice(0, pendientesLimit).map((o) => {
                const s = getSemaforo(o.creado_en, o.plazo);
                const pillTone = s.sem === "verde" ? "green" : s.sem === "amarillo" ? "yellow" : "red";
                const canEditThis = canEdit(o);

                return (
                  <div
                    key={o.id}
                    style={{
                      border: `1px solid ${getRiesgoColor(o.categoria)}`,
                      borderRadius: 16,
                      padding: 16,
                      background: "linear-gradient(180deg, #DCE6F2 0%, #C9D6E6 100%)",
                      boxShadow: "0 6px 16px rgba(15,23,42,0.08)",
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
                          {o.area} · {o.equipo_lugar}
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          NIVEL DE RIESGO:{" "}
                          <span
                            style={{
                              color: getRiesgoColor(o.categoria),
                              fontSize: 12,
                              fontWeight: 900,
                              textTransform: "uppercase",
                            }}
                          >
                            {o.categoria}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          PLAZO ESTIMADO:{" "}
                          <span style={{ color: "#0f172a" }}>
                            {getPlazoEstimadoDias(o.creado_en, o.plazo)} dias
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 900 }}>
                          FECHA CREACION:{" "}
                          <span style={{ color: "#0f172a" }}>{formatDateDMY(o.creado_en)}</span>
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
                              width: 116,
                              height: 116,
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <ThumbImage
                              src={o.evidencia_url}
                              alt="Evidencia"
                              thumbWidth={110}
                              style={{
                                width: 110,
                                height: 110,
                                objectFit: "contain",
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

                          {canEditThis ? (
                            <button
                              onClick={() => openEditarModal(o)}
                              style={{
                                background: "#f8fafc",
                                color: "#334155",
                                border: "1px solid #cbd5f5",
                                padding: "6px 10px",
                                borderRadius: 8,
                                fontWeight: 800,
                                fontSize: 12,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: "pointer",
                              }}
                            >
                              ✏️ Editar
                            </button>
                          ) : (
                            <div style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>
                              Solo el creador o admin puede editar.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pendientes.length > pendientesLimit && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setPendientesLimit((n) => n + PAGE_SIZE)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cargar más
              </button>
            </div>
          )}
        </div>

        {/* Cerradas */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.35)",
            border: "1px solid rgba(148, 163, 184, 0.45)",
            borderRadius: 14,
            padding: 14,
            boxShadow: "0 20px 50px rgba(2, 6, 23, 0.35)",
            backdropFilter: "blur(8px)",
            outline: "1px solid rgba(148, 163, 184, 0.15)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, color: "#e2e8f0" }}>
            Cerradas ({cerradas.length})
          </div>

          {cerradas.length === 0 ? (
            <div style={{ color: "#cbd5f5", fontSize: 13 }}>Aún no hay cerradas.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {cerradas.slice(0, cerradasLimit).map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: `1px solid ${getRiesgoColor(o.categoria)}`,
                    borderRadius: 16,
                    padding: 16,
                    background: "linear-gradient(180deg, #DCE6F2 0%, #C9D6E6 100%)",
                    boxShadow: "0 6px 16px rgba(15,23,42,0.08)",
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
                        NIVEL DE RIESGO:{" "}
                        <span
                          style={{
                            color: getRiesgoColor(o.categoria),
                            fontSize: 12,
                            fontWeight: 900,
                            textTransform: "uppercase",
                          }}
                        >
                          {o.categoria}
                        </span>
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
                                <ThumbImage
                                  src={o.evidencia_url}
                                  alt="Antes"
                                  thumbWidth={108}
                                  style={{
                                    width: 108,
                                    height: 108,
                                    borderRadius: 10,
                                    objectFit: "contain",
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
                                onClick={() => openZoom(o.cierre_evidencia_url || "", "Después")}
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
                                <ThumbImage
                                  src={o.cierre_evidencia_url}
                                  alt="Después"
                                  thumbWidth={108}
                                  style={{
                                    width: 108,
                                    height: 108,
                                    borderRadius: 10,
                                    objectFit: "contain",
                                    display: "block",
                                  }}
                                />
                              </button>
                              <div style={{ fontSize: 10, fontWeight: 900, color: "#16a34a" }}>DESPUÉS</div>
                            </div>
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
                            justifySelf: "start",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            borderRadius: 8,
                            border: "1px solid #ef4444",
                            background: "#ef4444",
                            color: "white",
                            width: "fit-content",
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

          {cerradas.length > cerradasLimit && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setCerradasLimit((n) => n + PAGE_SIZE)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cargar más
              </button>
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
            zIndex: 90,
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

      {/* Modal Nueva Observación */}
      {newOpen && (
        <div
          onClick={() => !savingNew && !newUploading && setNewOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            zIndex: 70,
          }}
          className={styles.modalOverlay}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 96vw)" }} className={styles.modalPanel}>
            <div className={`${styles.card} ${styles.modalCardTight}`} role="dialog" aria-modal="true">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 900, color: "#e2e8f0", fontSize: 18 }}>Nueva observación</div>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setNewOpen(false)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "rgba(15,23,42,0.8)",
                    color: "#e2e8f0",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
              </div>

              {perfilErr && <div className={styles.errorBox}>{perfilErr}</div>}
              {newError && <div className={styles.errorBox}>{newError}</div>}

              <form onSubmit={guardarNueva} className={styles.form}>
                <div className={styles.twoCol}>
                  <label className={styles.field}>
                    <span className={styles.label}>Responsable (auto)</span>
                    <input
                      value={perfil?.nombre || ""}
                      disabled
                      className={`${styles.input} ${styles.disabled}`}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Área</span>
                    <select value={newArea} onChange={(e) => setNewArea(e.target.value)} className={styles.input}>
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
                      ref={newEquipoRef}
                      value={newEquipoLugar}
                      onChange={(e) => setNewEquipoLugar(e.target.value)}
                      placeholder="Ej: faja 8"
                      className={`${styles.input} ${newInvalid.equipo ? styles.inputError : ""}`}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Categoría</span>
                    <select
                      value={newCategoria}
                      onChange={(e) => setNewCategoria(e.target.value as any)}
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
                      value={newPlazo}
                      onChange={(e) => setNewPlazo(e.target.value)}
                      className={`${styles.input} ${newInvalid.plazo ? styles.inputError : ""}`}
                    />
                  </label>
                  <div className={styles.spacer} />
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>Descripción</span>
                  <textarea
                    value={newDescripcion}
                    onChange={(e) => setNewDescripcion(e.target.value)}
                    placeholder="Describe la observación..."
                    rows={3}
                    className={`${styles.input} ${styles.textarea} ${newInvalid.desc ? styles.inputError : ""}`}
                  />
                </label>

                <div className={`${styles.evidenceBlock} ${newInvalid.evidencia ? styles.inputErrorBlock : ""}`}>
                  <div className={styles.evidenceTitle}>Evidencia 📷</div>
                  <div className={styles.fileRow}>
                    <input
                      id="evidencia-file-new"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                      className={styles.fileInput}
                    />
                    <label htmlFor="evidencia-file-new" className={styles.fileButton}>
                      Seleccionar archivo
                    </label>
                    <span className={styles.fileName}>
                      {newFile ? newFile.name : "Ningún archivo seleccionado"}
                    </span>
                  </div>
                  {newUploadUrl && (
                    <div className={styles.helperText}>
                      ✅ URL generada:{" "}
                      <a href={newUploadUrl} target="_blank" rel="noreferrer" className={styles.linkInline}>
                        Ver
                      </a>
                    </div>
                  )}
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    onClick={() => setNewOpen(false)}
                    disabled={savingNew || newUploading}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "rgba(15,23,42,0.7)",
                      color: "#e2e8f0",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={!perfil || savingNew || newUploading} className={styles.submit}>
                    {newUploading ? "Subiendo..." : savingNew ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Observación */}
      {editOpen && editTarget && (
        <div
          onClick={() => !savingEdit && !editUploading && setEditOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            zIndex: 70,
          }}
          className={styles.modalOverlay}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 96vw)" }} className={styles.modalPanel}>
            <div className={`${styles.card} ${styles.modalCardTight}`} role="dialog" aria-modal="true">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 900, color: "#e2e8f0", fontSize: 18 }}>Editar observación</div>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "rgba(15,23,42,0.8)",
                    color: "#e2e8f0",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
              </div>

              {editError && <div className={styles.errorBox}>{editError}</div>}
              <form onSubmit={guardarEdicion} className={styles.form}>
                <div className={styles.twoCol}>
                  <label className={styles.field}>
                    <span className={styles.label}>Responsable</span>
                    <input
                      value={editResponsable || perfil?.nombre || ""}
                      disabled
                      className={`${styles.input} ${styles.disabled}`}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Área</span>
                    <select value={editArea} onChange={(e) => setEditArea(e.target.value)} className={styles.input}>
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
                      ref={editEquipoRef}
                      value={editEquipoLugar}
                      onChange={(e) => setEditEquipoLugar(e.target.value)}
                      placeholder="Ej: faja 8"
                      className={`${styles.input} ${editInvalid.equipo ? styles.inputError : ""}`}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Categoría</span>
                    <select
                      value={editCategoria}
                      onChange={(e) => setEditCategoria(e.target.value as any)}
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
                      value={editPlazo}
                      onChange={(e) => setEditPlazo(e.target.value)}
                      className={`${styles.input} ${editInvalid.plazo ? styles.inputError : ""}`}
                    />
                  </label>
                  <div className={styles.spacer} />
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>Descripción</span>
                  <textarea
                    value={editDescripcion}
                    onChange={(e) => setEditDescripcion(e.target.value)}
                    placeholder="Describe la observación..."
                    rows={3}
                    className={`${styles.input} ${styles.textarea} ${
                      editInvalid.desc ? styles.inputError : ""
                    }`}
                  />
                </label>

                <div
                  className={`${styles.evidenceBlock} ${editInvalid.evidencia ? styles.inputErrorBlock : ""}`}
                  style={{
                    position: "relative",
                    paddingRight: editCurrentUrl ? 110 : undefined,
                    minHeight: editCurrentUrl ? 96 : undefined,
                  }}
                >
                  <div className={styles.evidenceTitle}>Evidencia 📷</div>
                  {editCurrentUrl && (
                    <button
                      type="button"
                      onClick={() => openZoom(editCurrentUrl || "", "Evidencia")}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "2px solid rgba(148,163,184,0.7)",
                        borderRadius: 10,
                        padding: 4,
                        background: "rgba(15,23,42,0.45)",
                        cursor: "zoom-in",
                        display: "inline-flex",
                      }}
                      title="Ver evidencia"
                    >
                      <ThumbImage
                        src={editCurrentUrl}
                        alt="Evidencia actual"
                        thumbWidth={72}
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: "contain",
                          borderRadius: 8,
                        }}
                      />
                    </button>
                  )}
                  <div className={styles.fileRow}>
                    <input
                      id="evidencia-file-edit"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                      className={styles.fileInput}
                    />
                    <label htmlFor="evidencia-file-edit" className={styles.fileButton}>
                      Seleccionar archivo
                    </label>
                    <span className={styles.fileName}>
                      {editFile ? editFile.name : "Ningún archivo seleccionado"}
                    </span>
                  </div>
                  {editUploadUrl && (
                    <div className={styles.helperText}>
                      ✅ URL generada:{" "}
                      <a href={editUploadUrl} target="_blank" rel="noreferrer" className={styles.linkInline}>
                        Ver
                      </a>
                    </div>
                  )}
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    disabled={savingEdit || editUploading}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "rgba(15,23,42,0.7)",
                      color: "#e2e8f0",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingEdit || editUploading} className={styles.submit}>
                    {editUploading ? "Subiendo..." : savingEdit ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
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
            background: "rgba(2,6,23,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            zIndex: 70,
          }}
          className={styles.modalOverlay}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 96vw)" }} className={styles.modalPanel}>
            <div className={`${styles.card} ${styles.modalCardTight}`} role="dialog" aria-modal="true">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 900, color: "#e2e8f0", fontSize: 18 }}>
                  Cerrar observación (evidencia obligatoria)
                </div>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setCloseOpen(false)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "rgba(15,23,42,0.8)",
                    color: "#e2e8f0",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Cerrar
                </button>
              </div>

              {closeError && <div className={styles.errorBox}>{closeError}</div>}
              <form onSubmit={(e) => e.preventDefault()} className={styles.form}>
                <div className={styles.helperText}>
                  {closeTarget ? (
                    <>
                      <b>{closeTarget.area}</b> — {closeTarget.descripcion}
                    </>
                  ) : null}
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>Descripción del trabajo realizado *</span>
                  <textarea
                    ref={closeDescRef}
                    value={closeDesc}
                    onChange={(e) => setCloseDesc(e.target.value)}
                    placeholder="Ej: Se instaló guarda, se ajustó pernos, se limpió..."
                    rows={3}
                    className={`${styles.input} ${styles.textarea} ${closeInvalid.desc ? styles.inputError : ""}`}
                  />
                </label>

                <div
                  className={`${styles.evidenceBlock} ${closeInvalid.evidencia ? styles.inputErrorBlock : ""}`}
                >
                  <div className={styles.evidenceTitle}>Evidencia 📷 *</div>
                  <div className={styles.fileRow}>
                  <input
                    id="evidencia-file-close"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setCloseFile(e.target.files?.[0] ?? null)}
                    className={styles.fileInput}
                  />
                    <label htmlFor="evidencia-file-close" className={styles.fileButton}>
                      Seleccionar archivo
                    </label>
                    <span className={styles.fileName}>
                      {closeFile ? closeFile.name : "Ningún archivo seleccionado"}
                    </span>
                  </div>
              </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    disabled={savingClose}
                    onClick={() => setCloseOpen(false)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "rgba(15,23,42,0.7)",
                      color: "#e2e8f0",
                      fontWeight: 800,
                      cursor: savingClose ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancelar
                  </button>

                  <button type="button" disabled={savingClose} onClick={confirmarCierre} className={styles.submit}>
                    {savingClose ? "Cerrando..." : "✅ Confirmar cierre"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







