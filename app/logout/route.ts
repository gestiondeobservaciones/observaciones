// app/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();

  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();

  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}
