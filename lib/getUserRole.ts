// lib/getUserRole.ts
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Obtiene el rol del usuario autenticado desde public.usuarios
 * Retorna: "admin" | "user" | null
 */
export async function getUserRole(): Promise<"admin" | "user" | null> {
  const supabase = supabaseBrowser;

  // Obtener sesión actual
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return null;
  }

  // Consultar rol en tabla usuarios
  const { data, error } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", session.user.id)
    .single();

  if (error || !data) {
    return null;
  }

  if (data.rol !== "admin" && data.rol !== "user") {
    return null;
  }

  return data.rol;
}
