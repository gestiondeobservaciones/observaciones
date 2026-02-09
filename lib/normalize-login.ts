export function normalizeLogin(input: string) {
  const v = (input || "").trim();

  // si solo son números -> DNI
  if (/^\d{6,12}$/.test(v)) {
    return `${v}@observaciones.local`;
  }

  // si ya es email normal
  return v.toLowerCase();
}
