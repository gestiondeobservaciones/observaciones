"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Obs = {
  id: string;
  estado: "pendiente" | "cerrada";
  area: string;
  categoria: "bajo" | "medio" | "alto";
  responsable: string;
};

function countBy<T extends string>(items: T[]) {
  const out: Record<string, number> = {};
  for (const it of items) out[it] = (out[it] || 0) + 1;
  return out;
}

function topN(map: Record<string, number>, n = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export default function DashboardPage() {
  const [data, setData] = useState<Obs[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data, error } = await supabase
      .from("observaciones")
      .select("id,estado,area,categoria,responsable");

    if (!error && data) setData(data as Obs[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const pendientes = data.filter((o) => o.estado === "pendiente");
    const cerradas = data.filter((o) => o.estado === "cerrada");

    const pendientesPorCategoria = countBy(pendientes.map((o) => o.categoria));
    const topAreas = topN(countBy(pendientes.map((o) => o.area)), 5);
    const topResponsables = topN(countBy(pendientes.map((o) => o.responsable)), 5);

    return {
      total: data.length,
      pendientes: pendientes.length,
      cerradas: cerradas.length,
      pendientesPorCategoria,
      topAreas,
      topResponsables,
    };
  }, [data]);

  if (loading) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <main style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Dashboard (público)</h2>
        <Link href="/publico">⬅ Volver</Link>
        <button onClick={load}>🔄 Recargar</button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, minWidth: 180 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
        </div>

        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, minWidth: 180 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Pendientes</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.pendientes}</div>
        </div>

        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, minWidth: 180 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Cerradas</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.cerradas}</div>
        </div>
      </div>

      <h3 style={{ marginBottom: 6 }}>Pendientes por categoría</h3>
      <ul>
        <li>Alto: {stats.pendientesPorCategoria.alto || 0}</li>
        <li>Medio: {stats.pendientesPorCategoria.medio || 0}</li>
        <li>Bajo: {stats.pendientesPorCategoria.bajo || 0}</li>
      </ul>

      <h3 style={{ marginBottom: 6, marginTop: 18 }}>Top áreas (pendientes)</h3>
      <ol>
        {stats.topAreas.map(([k, v]) => (
          <li key={k}>
            {k}: {v}
          </li>
        ))}
      </ol>

      <h3 style={{ marginBottom: 6, marginTop: 18 }}>Top responsables (pendientes)</h3>
      <ol>
        {stats.topResponsables.map(([k, v]) => (
          <li key={k}>
            {k}: {v}
          </li>
        ))}
      </ol>
    </main>
  );
}
