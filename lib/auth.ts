import { supabase } from "./supabase";

export async function getUserRole() {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;

  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single();

  return data?.rol || "usuario";
}
