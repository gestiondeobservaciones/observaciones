"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestPage() {
  const [data, setData] = useState<any[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("observaciones").select("*");
      if (error) setErr(error.message);
      else setData(data ?? []);
    })();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Test Supabase</h1>
      {err && <pre style={{ color: "red" }}>{err}</pre>}
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
