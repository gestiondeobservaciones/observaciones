"use client";
import { redirect } from "next/navigation";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextUrl = searchParams?.next || "/observaciones";
  redirect(`/?login=1&next=${encodeURIComponent(nextUrl)}`);
}
