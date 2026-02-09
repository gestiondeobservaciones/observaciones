"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Usuario = {
  id: string;
  email: string | null;
  rol: "admin" | "usuario";
  creado_en: string;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [meEmail, setMeEmail] = useState<string>("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState<string>("");

  async function ensureUserRow() {
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user) return;

    const email = user.email ?? "";
    setMeEmail(email);

    // Ver si ya existe fila en usuarios
    const { data: row, error: e1 } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (e1) {
      // si falla por permisos o cualquier cosa
      console.warn(e1);
      return;
    }

    if (!row) {
      // crear su fila (rol por defecto: usuario)
      await supabase.from("usuarios").insert({
        id: user.id,
        email,
        rol: "usuario",
      });
    }
  }

  async function load() {
    setLoading(true);
    setError("");

    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;

    if (!user) {
      setError("No has iniciado sesión.");
      setLoading(false);
      return;
    }

    await ensureUserRow();

    // Leer mi rol
    const { data: me, error: eMe } = await supabase
      .from("usuarios")
      .select("rol,email")
      .eq("id", user.id)
      .maybeSingle();

    if (eMe || !me) {
      setError("No pude leer tu rol. Revisa políticas RLS.");
      setLoading(false);
      return;
    }

    const isAdmin = me.rol === "admin";
    setMeAdmin(isAdmin);

    if (!isAdmin) {
      setError("Acceso denegado: solo administradores.");
      setLoading(false);
      return;
    }

    // Si soy admin, traigo todos los usuarios (esto requiere admin)
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .order("creado_en", { ascending: false });

    if (error) {
      setError("Error cargando usuarios: " + error.message);
      setLoading(false);
      return;
    }

    setUsuarios((data ?? []) as Usuario[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setRol(id: string, rol: "admin" | "usuario") {
    setError("");
    const { error } = await supabase.from("usuarios").update({ rol }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar rol: " + error.message);
      return;
    }
    await load();
  }

  async function logout() {
    await supabase.auth.signOut();
    document.cookie = "obs_session=; path=/; max-age=0";
    window.location.href = "/login";
  }

  if (loading) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <main style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Admin — Roles</h2>
        <Link href="/">🏠 Inicio</Link>
        <Link href="/publico">📄 Público</Link>
        <Link href="/observaciones">🧑‍🏭 Panel</Link>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, opacity: 0.8 }}>{meEmail}</span>
        <button onClick={logout}>Salir</button>
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid #f00", color: "#c00", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!meAdmin ? (
        <p>No eres admin.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Rol</th>
                <th style={th}>UID</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.email ?? "-"}</td>
                  <td style={td}>
                    <b>{u.rol}</b>
                  </td>
                  <td style={td} title={u.id}>
                    <code style={{ fontSize: 12 }}>{u.id}</code>
                  </td>
                  <td style={td}>
                    {u.rol !== "admin" ? (
                      <button onClick={() => setRol(u.id, "admin")}>Hacer admin</button>
                    ) : (
                      <button onClick={() => setRol(u.id, "usuario")}>Quitar admin</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: 8,
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 8,
  verticalAlign: "top",
};
