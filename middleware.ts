// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // Rutas públicas
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/publico") ||
    pathname.startsWith("/historial");

  // Login siempre permitido (si ya hay sesión, lo mando a /observaciones)
  if (pathname.startsWith("/login")) {
    if (session) {
      const url = req.nextUrl.clone();
      url.pathname = "/observaciones";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return res;
  }

  // Logout siempre permitido (para cortar loops)
  if (pathname.startsWith("/logout")) {
    return res;
  }

  // Si es público, no requiere sesión
  if (isPublic) return res;

  // Protegidas
  const needsAuth =
    pathname.startsWith("/observaciones") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin");

  if (needsAuth && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
