"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AREAS, CATEGORIAS } from "@/lib/constants";
import styles from "./page.module.css";

type Obs = {
  id: string;
  estado: "pendiente" | "cerrada";
  area: string;
  categoria: "bajo" | "medio" | "alto";
  responsable: string;
  creado_por: string | null;
  creado_en: string;
  cerrado_por: string | null;
  cerrado_en: string | null;
};

type Intervalo = "dia" | "semana" | "mes";

function toDateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseISO(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inRange(d: Date, from?: string, to?: string) {
  const t = d.getTime();
  if (from) {
    const f = new Date(from);
    if (t < f.getTime()) return false;
  }
  if (to) {
    const tt = new Date(to);
    const end = new Date(tt.getFullYear(), tt.getMonth(), tt.getDate(), 23, 59, 59, 999);
    if (t > end.getTime()) return false;
  }
  return true;
}

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportSvgToPng(svgId: string, name: string) {
  const svg = document.getElementById(svgId) as SVGSVGElement | null;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const xml = new XMLSerializer().serializeToString(clone);
  const svg64 = btoa(unescape(encodeURIComponent(xml)));
  const image64 = `data:image/svg+xml;base64,${svg64}`;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = svg.viewBox.baseVal.width || svg.clientWidth || 800;
    canvas.height = svg.viewBox.baseVal.height || svg.clientHeight || 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = name;
    a.click();
  };
  img.src = image64;
}

export default function DashboardPage() {
  const [data, setData] = useState<Obs[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [estado, setEstado] = useState<"todas" | "pendiente" | "cerrada">("todas");
  const [topN, setTopN] = useState(10);
  const [intervalo, setIntervalo] = useState<Intervalo>("semana");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("observaciones")
      .select("id,estado,area,categoria,responsable,creado_por,creado_en,cerrado_por,cerrado_en");
    if (!error && data) setData(data as Obs[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return data.filter((o) => {
      const creado = parseISO(o.creado_en);
      if (!creado) return false;
      if (!inRange(creado, from, to)) return false;
      if (areas.length && !areas.includes(o.area)) return false;
      if (cats.length && !cats.includes(o.categoria)) return false;
      if (estado !== "todas" && o.estado !== estado) return false;
      return true;
    });
  }, [data, from, to, areas, cats, estado]);

  const totalCount = filtered.length;

  const usersBars = useMemo(() => {
    const created: Record<string, number> = {};
    const closed: Record<string, number> = {};
    for (const o of filtered) {
      const u = o.creado_por || "desconocido";
      created[u] = (created[u] || 0) + 1;
      if (o.cerrado_por) closed[o.cerrado_por] = (closed[o.cerrado_por] || 0) + 1;
    }
    const keys = Array.from(new Set([...Object.keys(created), ...Object.keys(closed)]));
    const items = keys.map((k) => ({
      user: k,
      created: created[k] || 0,
      closed: closed[k] || 0,
    }));
    items.sort((a, b) => Math.max(b.created, b.closed) - Math.max(a.created, a.closed));
    return items.slice(0, Math.max(1, topN));
  }, [filtered, topN]);

  const areaPie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of AREAS) map[a] = 0;
    for (const o of filtered) map[o.area] = (map[o.area] || 0) + 1;
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const top = entries.filter(([, v]) => v > 0).slice(0, Math.max(1, topN));
    const topSum = top.reduce((s, [, v]) => s + v, 0);
    const others = Math.max(0, total - topSum);
    return { map, total, entries, top, others };
  }, [filtered, topN]);

  const series = useMemo(() => {
    const createdMap: Record<string, number> = {};
    const closedMap: Record<string, number> = {};

    function keyFor(d: Date) {
      if (intervalo === "dia") return d.toISOString().slice(0, 10);
      if (intervalo === "semana") {
        const date = toDateOnly(d);
        const day = date.getDay() || 7;
        date.setDate(date.getDate() - day + 1);
        return date.toISOString().slice(0, 10);
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    for (const o of filtered) {
      const c = parseISO(o.creado_en);
      if (c) {
        const k = keyFor(c);
        createdMap[k] = (createdMap[k] || 0) + 1;
      }
      const cerr = parseISO(o.cerrado_en);
      if (cerr) {
        const k = keyFor(cerr);
        closedMap[k] = (closedMap[k] || 0) + 1;
      }
    }

    const keys = Array.from(new Set([...Object.keys(createdMap), ...Object.keys(closedMap)])).sort();
    return {
      labels: keys,
      created: keys.map((k) => createdMap[k] || 0),
      closed: keys.map((k) => closedMap[k] || 0),
    };
  }, [filtered, intervalo]);

  const severity = useMemo(() => {
    const map = { bajo: 0, medio: 0, alto: 0 };
    for (const o of filtered) map[o.categoria] += 1;
    return map;
  }, [filtered]);

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <h1>Dashboard de Observaciones</h1>
          <p>Vista dinámica con filtros globales y exportación por gráfico.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.ghost} onClick={load}>
            Recargar
          </button>
        </div>
      </section>

      <section className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Rango fechas</label>
          <div className={styles.row}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Áreas</label>
          <div className={styles.chips}>
            {AREAS.map((a) => (
              <button
                key={a}
                className={areas.includes(a) ? styles.chipActive : styles.chip}
                onClick={() =>
                  setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
                }
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Categorías</label>
          <div className={styles.chips}>
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                className={cats.includes(c) ? styles.chipActive : styles.chip}
                onClick={() =>
                  setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Estado</label>
          <div className={styles.row}>
            <select value={estado} onChange={(e) => setEstado(e.target.value as any)}>
              <option value="todas">Todas</option>
              <option value="pendiente">Abiertas</option>
              <option value="cerrada">Cerradas</option>
            </select>
            <select value={intervalo} onChange={(e) => setIntervalo(e.target.value as Intervalo)}>
              <option value="dia">Día</option>
              <option value="semana">Semana</option>
              <option value="mes">Mes</option>
            </select>
            <input
              type="number"
              min={3}
              max={50}
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value) || 10)}
            />
          </div>
        </div>

        <div className={styles.filterSummary}>
          Total filtradas: <b>{totalCount}</b>
        </div>
      </section>

      {loading ? (
        <div className={styles.loading}>Cargando...</div>
      ) : (
        <section className={styles.grid}>
          {/* 1. Distribucion por area */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Distribucion por area</h3>
                <span>Top areas con mas observaciones</span>
              </div>
              <div className={styles.exportButtons}>
                <button onClick={() => exportSvgToPng("chart-areas", "areas.png")}>PNG</button>
                <button
                  onClick={() =>
                    downloadCsv("areas.csv", [
                      ["area", "total", "porcentaje"],
                      ...areaPie.top.map(([k, v]) => [k, v, areaPie.total ? v / areaPie.total : 0]),
                      ...(areaPie.others
                        ? [["Otros", areaPie.others, areaPie.total ? areaPie.others / areaPie.total : 0]]
                        : []),
                    ])
                  }
                >
                  CSV
                </button>
              </div>
            </div>
            <svg id="chart-areas" viewBox="0 0 640 300" className={styles.chartSvg}>
              <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000" floodOpacity="0.35" />
                </filter>
              </defs>
              {(() => {
                const cx = 220;
                const cy = 150;
                const r = 100;
                const r2 = 56;
                const total = Math.max(1, areaPie.total);
                const base = areaPie.top.map(([k, v]) => ({ k, v }));
                const slices = areaPie.others ? [...base, { k: "Otros", v: areaPie.others }] : base;
                const colors = ["#4B8BBE", "#306998", "#FFE873", "#7AA6C2", "#1f4b6e", "#c2b45a", "#1b3b5a"];
                let start = -Math.PI / 2;
                return (
                  <>
                    <g filter="url(#shadow)">
                      {slices.map((slice, idx) => {
                        const { k: area, v } = slice;
                        const ang = (v / total) * Math.PI * 2;
                        const end = start + ang;
                        const large = ang > Math.PI ? 1 : 0;
                        const x1 = cx + r * Math.cos(start);
                        const y1 = cy + r * Math.sin(start) + 10;
                        const x2 = cx + r * Math.cos(end);
                        const y2 = cy + r * Math.sin(end) + 10;
                        const x3 = cx + r2 * Math.cos(end);
                        const y3 = cy + r2 * Math.sin(end) + 10;
                        const x4 = cx + r2 * Math.cos(start);
                        const y4 = cy + r2 * Math.sin(start) + 10;
                        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4} Z`;
                        start = end;
                        return <path key={area + "shadow"} d={d} fill="#0f172a" opacity="0.35" />;
                      })}
                    </g>
                    {(() => {
                      let s = -Math.PI / 2;
                      return slices.map((slice, idx) => {
                        const { k: area, v } = slice;
                        const ang = (v / total) * Math.PI * 2;
                        const end = s + ang;
                        const large = ang > Math.PI ? 1 : 0;
                        const x1 = cx + r * Math.cos(s);
                        const y1 = cy + r * Math.sin(s);
                        const x2 = cx + r * Math.cos(end);
                        const y2 = cy + r * Math.sin(end);
                        const x3 = cx + r2 * Math.cos(end);
                        const y3 = cy + r2 * Math.sin(end);
                        const x4 = cx + r2 * Math.cos(s);
                        const y4 = cy + r2 * Math.sin(s);
                        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4} Z`;
                        const mid = s + ang / 2;
                        const lx = cx + (r + 18) * Math.cos(mid);
                        const ly = cy + (r + 18) * Math.sin(mid);
                        const pct = v / total;
                        s = end;
                        return (
                          <g key={area}>
                            <path d={d} fill={colors[idx % colors.length]}>
                              <title>
                                {area}
Total: {v}
%: {formatPct(pct)}
                              </title>
                            </path>
                            {v > 0 && (
                              <text x={lx} y={ly} fontSize="10" fill="#e2e8f0" textAnchor="middle">
                                {Math.round(pct * 100)}%
                              </text>
                            )}
                          </g>
                        );
                      });
                    })()}
                  </>
                );
              })()}
            </svg>
            <div className={styles.legend}>
              {areaPie.top.map(([k, v], i) => (
                <span key={k}>
                  <i
                    style={{
                      background: ["#4B8BBE", "#306998", "#FFE873", "#7AA6C2", "#1f4b6e", "#c2b45a"][i % 6],
                    }}
                  />{" "}
                  {i + 1}. {k} - {v}
                </span>
              ))}
              {areaPie.others > 0 && (
                <span>
                  <i style={{ background: "#1b3b5a" }} /> Otros - {areaPie.others}
                </span>
              )}
            </div>
          </div>

          {/* 2. Barras comparativas */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Usuarios con mas observaciones</h3>
                <span>Subidas vs cerradas</span>
              </div>
              <div className={styles.exportButtons}>
                <button onClick={() => exportSvgToPng("chart-users", "usuarios.png")}>PNG</button>
                <button
                  onClick={() =>
                    downloadCsv("usuarios.csv", [
                      ["usuario", "subidas", "cerradas"],
                      ...usersBars.map((u) => [u.user, u.created, u.closed]),
                    ])
                  }
                >
                  CSV
                </button>
              </div>
            </div>
            <svg id="chart-users" viewBox="0 0 640 280" className={styles.chartSvg}>
              <rect x="0" y="0" width="640" height="280" fill="transparent" />
              <g transform="translate(60,20)">
                {(() => {
                  const w = 520;
                  const h = 220;
                  const max = Math.max(1, ...usersBars.map((u) => Math.max(u.created, u.closed)));
                  const groupW = w / Math.max(1, usersBars.length);
                  return (
                    <>
                      <line x1={0} y1={h} x2={w} y2={h} stroke="#2d3748" strokeWidth={1} />
                      {usersBars.map((u, i) => {
                        const x = i * groupW + 10;
                        const barW = (groupW - 20) / 2;
                        const h1 = (u.created / max) * (h - 20);
                        const h2 = (u.closed / max) * (h - 20);
                        const total = u.created + u.closed || 1;
                        return (
                          <g key={u.user}>
                            <rect
                              x={x}
                              y={h - h1}
                              width={barW}
                              height={h1}
                              rx={4}
                              fill="#4B8BBE"
                            >
                              <title>
                                {u.user}
Subidas: {u.created} ({formatPct(u.created / total)})
Cerradas:{" "}
                                {u.closed} ({formatPct(u.closed / total)})
                              </title>
                            </rect>
                            <rect
                              x={x + barW + 6}
                              y={h - h2}
                              width={barW}
                              height={h2}
                              rx={4}
                              fill="#FFE873"
                            >
                              <title>
                                {u.user}
Subidas: {u.created} ({formatPct(u.created / total)})
Cerradas:{" "}
                                {u.closed} ({formatPct(u.closed / total)})
                              </title>
                            </rect>
                            <text
                              x={x + barW}
                              y={h + 16}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#cbd5f5"
                            >
                              {u.user.slice(0, 10)}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </g>
            </svg>
            <div className={styles.legend}>
              <span>
                <i style={{ background: "#4B8BBE" }} /> Subidas
              </span>
              <span>
                <i style={{ background: "#FFE873" }} /> Cerradas
              </span>
            </div>
          </div>

          {/* 3. Serie temporal */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Nuevas vs cerradas</h3>
                <span>Intervalo: {intervalo}</span>
              </div>
              <div className={styles.exportButtons}>
                <button onClick={() => exportSvgToPng("chart-time", "serie.png")}>PNG</button>
                <button
                  onClick={() =>
                    downloadCsv("serie.csv", [
                      ["periodo", "nuevas", "cerradas"],
                      ...series.labels.map((l, i) => [l, series.created[i], series.closed[i]]),
                    ])
                  }
                >
                  CSV
                </button>
              </div>
            </div>
            <svg id="chart-time" viewBox="0 0 640 280" className={styles.chartSvg}>
              <g transform="translate(50,20)">
                {(() => {
                  const w = 540;
                  const h = 220;
                  const max = Math.max(1, ...series.created, ...series.closed);
                  const step = series.labels.length > 1 ? w / (series.labels.length - 1) : w;
                  const points = series.created.map((v, i) => `${i * step},${h - (v / max) * (h - 20)}`).join(" ");
                  const points2 = series.closed.map((v, i) => `${i * step},${h - (v / max) * (h - 20)}`).join(" ");
                  return (
                    <>
                      <line x1={0} y1={h} x2={w} y2={h} stroke="#2d3748" />
                      <polyline points={points} fill="none" stroke="#4B8BBE" strokeWidth={3} />
                      <polyline points={points2} fill="none" stroke="#FFE873" strokeWidth={3} />
                      {series.labels.map((l, i) => (
                        <text key={l} x={i * step} y={h + 16} fontSize="9" fill="#cbd5f5" textAnchor="middle">
                          {l.slice(5)}
                        </text>
                      ))}
                    </>
                  );
                })()}
              </g>
            </svg>
            <div className={styles.legend}>
              <span>
                <i style={{ background: "#4B8BBE" }} /> Nuevas
              </span>
              <span>
                <i style={{ background: "#FFE873" }} /> Cerradas
              </span>
            </div>
          </div>

          {/* 4. Severidad 3D */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Distribucion por severidad</h3>
                <span>Bloques 3D apilados</span>
              </div>
              <div className={styles.exportButtons}>
                <button onClick={() => exportSvgToPng("chart-sev", "severidad.png")}>PNG</button>
                <button
                  onClick={() =>
                    downloadCsv("severidad.csv", [
                      ["categoria", "total"],
                      ["bajo", severity.bajo],
                      ["medio", severity.medio],
                      ["alto", severity.alto],
                    ])
                  }
                >
                  CSV
                </button>
              </div>
            </div>
            <svg id="chart-sev" viewBox="0 0 360 280" className={styles.chartSvg}>
              {(() => {
                const total = Math.max(1, severity.bajo + severity.medio + severity.alto);
                const baseW = 200;
                const baseD = 60;
                const baseH = 120;
                const scale = (v: number) => Math.max(20, (v / total) * baseH);
                const blocks = [
                  { k: "bajo", v: severity.bajo, color: "#4B8BBE" },
                  { k: "medio", v: severity.medio, color: "#306998" },
                  { k: "alto", v: severity.alto, color: "#FFE873" },
                ];
                let y = 210;
                return (
                  <g transform="translate(80,0)">
                    {blocks.map((b, i) => {
                      const h = scale(b.v);
                      const w = baseW - i * 24;
                      const d = baseD - i * 6;
                      const x = 0 + i * 12;
                      const top = y - h;
                      const p1 = `${x},${top}`;
                      const p2 = `${x + w},${top}`;
                      const p3 = `${x + w + d},${top - d / 2}`;
                      const p4 = `${x + d},${top - d / 2}`;
                      const side1 = `${x + w},${top} ${x + w},${y} ${x + w + d},${y - d / 2} ${x + w + d},${
                        top - d / 2
                      }`;
                      const side2 = `${x},${top} ${x},${y} ${x + d},${y - d / 2} ${x + d},${top - d / 2}`;
                      y = top;
                      return (
                        <g key={b.k}>
                          <polygon points={side2} fill="#1f2937" opacity="0.45" />
                          <polygon points={side1} fill="#0b1220" opacity="0.55" />
                          <polygon points={`${p1} ${p2} ${p3} ${p4}`} fill={b.color} />
                          <text x={x + w / 2} y={top - 6} textAnchor="middle" fontSize="11" fill="#e2e8f0">
                            {b.k} - {b.v}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          </div>
        </section>
      )}
    </main>
  );
}
