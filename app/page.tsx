"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUserRole } from "@/lib/auth";

export default function Home() {
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    getUserRole().then(setRol);
  }, []);

  return (
    <main style={{ padding: 20 }}>
      <h1>sistema — Control de Observaciones</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/publico">📋 Ver pendientes</Link>
        <Link href="/historial">✅ Ver cerradas</Link>
        <Link href="/dashboard">📊 Dashboard</Link>
        <Link href="/observaciones">🧑‍🔧 Panel usuarios</Link>
        <Link href="/admin">🛡️ Admin (roles)</Link>


        {rol === "admin" && (
          <Link href="/admin">🔐 Panel admin</Link>
        )}

        <Link href="/login">🔑 Ingresar</Link>
      </div>
    </main>
  );
}
