import { NextResponse } from "next/server";
import { google } from "googleapis";

type Payload = {
  action: "create" | "close" | "edit";
  data: {
    id: string;
    estado: "pendiente" | "cerrada";
    responsable: string;
    area: string;
    equipo_lugar: string;
    categoria: "bajo" | "medio" | "alto";
    plazo: string;
    descripcion: string;
    creado_por?: string | null;
    creado_en?: string;
    cerrado_por?: string | null;
    cerrado_en?: string | null;
    cierre_descripcion?: string | null;
  };
};

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    if (!body?.action || !body?.data?.id) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const keyFile = getEnv("GOOGLE_SA_KEY_PATH");
    const spreadsheetId = getEnv("GOOGLE_SHEETS_ID");
    const sheetTab = getEnv("GOOGLE_SHEETS_TAB");

    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const row = [
      new Date().toISOString(),
      body.action,
      body.data.id,
      body.data.estado,
      body.data.responsable,
      body.data.area,
      body.data.equipo_lugar,
      body.data.categoria,
      body.data.plazo,
      body.data.descripcion,
      body.data.creado_por ?? "",
      body.data.creado_en ?? "",
      body.data.cerrado_por ?? "",
      body.data.cerrado_en ?? "",
      body.data.cierre_descripcion ?? "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetTab,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
