export type SemaforoEstado = "verde" | "amarillo" | "rojo";

/**
 * Regla simple (por ahora):
 * - vencido: si plazo <= hoy
 * - por vencer: si faltan <= 2 días
 * - en tiempo: resto
 *
 * (Luego lo ajustamos a tu regla % si quieres.)
 */
export function getSemaforo(plazoISO: string): SemaforoEstado {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const plazo = new Date(plazoISO);
  plazo.setHours(0, 0, 0, 0);

  const diffMs = plazo.getTime() - hoy.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias <= 0) return "rojo";
  if (diffDias <= 2) return "amarillo";
  return "verde";
}
