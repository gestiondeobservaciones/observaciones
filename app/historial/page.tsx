"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ImageLightbox from "@/components/ImageLightbox";
type Obs = {
  id: string;
  area: string;
  descripcion: string;
  categoria: "bajo" | "medio" | "alto";
  cierre_descripcion: string | null;
  cierre_evidencia_url: string | null;
  cerrado_por: string | null;
  cerrado_en: string | null;
};

export default function HistorialPage() {
  const [data, setData] = useState<Obs[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("observaciones")
      .select("*")
      .eq("estado", "cerrada")
      .order("cerrado_en", { ascending: false });

    if (!error && data) setData(data as Obs[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Historial de observaciones cerradas</h2>
        <Link href="/publico">⬅ Volver</Link>
      </div>

      {data.length === 0 && <p>No hay observaciones cerradas.</p>}

      <ul style={{ paddingLeft: 18 }}>
        {data.map((o) => (
          <li key={o.id} style={{ marginBottom: 16 }}>
            <strong>{o.area}</strong> — {o.descripcion} ({o.categoria})
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Cerrada por: {o.cerrado_por || "—"} <br />
              Fecha: {o.cerrado_en ? new Date(o.cerrado_en).toLocaleDateString() : "—"}
            </div>

            {o.cierre_descripcion && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                🛠 {o.cierre_descripcion}
              </div>
            )}

            {o.cierre_evidencia_url && (
              <div style={{ marginTop: 4 }}>
                📷{" "}
                {o.cierre_evidencia_url && (
  <div style={{ marginTop: 6 }}>
    <ImageLightbox src={o.cierre_evidencia_url} />
  </div>
)}

              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
