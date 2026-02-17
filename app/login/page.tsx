"use client";
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get("next") || "/observaciones";

  useEffect(() => {
    router.replace(`/?login=1&next=${encodeURIComponent(nextUrl)}`);
  }, [router, nextUrl]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      Redirigiendo...
    </main>
  );
}
