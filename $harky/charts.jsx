/* ============================================================
   $harky — Íconos SVG + gráficas
   Exporta a window: Icon, Donut, Bars, AreaLine, Progress
   ============================================================ */
const { useState: _useSC, useEffect: _useEC } = React;

/* ─── Paths de íconos ────────────────────────────────────── */
const ICON_PATHS = {
  // categorías
  home:   "M3 11l9-8 9 8M5 9.5V21h14V9.5",
  cart:   "M3 4h2l2.4 12.4a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L21 8H6M9 21h.01M17 21h.01",
  food:   "M4 3v8M4 11a2 2 0 0 0 2-2V3M6 3v18M16 3c-1.5 1-2 3-2 6s.5 4 2 4v8",
  car:    "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14v5H5zM7 16v2M17 16v2",
  bolt:   "M13 2L4 14h7l-1 8 9-12h-7z",
  play:   "M5 4l14 8-14 8z",
  heart:  "M12 20s-7-4.3-9.5-8.5C1 8 3 4.5 6.5 4.5c2 0 3.2 1 5.5 3 2.3-2 3.5-3 5.5-3C21 4.5 23 8 21.5 11.5 19 15.7 12 20 12 20z",
  bag:    "M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0",
  book:   "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 17H7a3 3 0 0 0-3 3",
  wallet: "M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2.5-3h11M16 13h2",
  laptop: "M4 5h16v11H4zM2 19h20l-2-3H4z",
  trend:  "M3 17l6-6 4 4 7-8M21 7h-5M21 7v5",
  // navegación
  grid:   "M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z",
  list:   "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  cards:  "M3 6h18v6H3zM3 14h12v4H3z",
  chart:  "M4 20V10M10 20V4M16 20v-7M22 20H2",
  target: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12h.01",
  // acciones
  plus:      "M12 5v14M5 12h14",
  arrowUp:   "M12 19V5M5 12l7-7 7 7",
  arrowDn:   "M12 5v14M19 12l-7 7-7-7",
  shark:     "M2 12c4-1 6-4 11-4 4 0 7 2 9 4-2 2-5 4-9 4-2 0-3-.5-4-1l-3 3 .5-3.5C4 14 3 13 2 12z",
  search:    "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3",
  bell:      "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21a2 2 0 0 0 4 0",
  close:     "M6 6l12 12M18 6L6 18",
  calendar:  "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  dots:      "M12 5h.01M12 12h.01M12 19h.01",
  edit:      "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z",
  trash:     "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  download:  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  print:     "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
};

function Icon({ name, size = 20, stroke = 2, style, fill = "none" }) {
  const d = ICON_PATHS[name] || ICON_PATHS.dots;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
         stroke="currentColor" strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round"
         style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ─── Donut chart ────────────────────────────────────────── */
function Donut({ data, size = 220, thickness = 26, gap = 0.012, centerTop, centerBottom }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r     = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ  = 2 * Math.PI * r;
  const [hover, setHover] = _useSC(null);
  let acc = 0;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const len  = Math.max(0, (frac - gap) * circ);
          const dash = `${len} ${circ - len}`;
          const offset = -acc * circ;
          acc += frac;
          const active = hover === i;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth={active ? thickness + 5 : thickness}
              strokeDasharray={dash} strokeDashoffset={offset} strokeLinecap="butt"
              style={{ transition: "stroke-width .15s ease", cursor: "pointer" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)} />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          {hover != null ? data[hover].label : centerTop}
        </div>
        <div style={{ fontSize: 21, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
          {hover != null ? window.SharkyData.fmtCompact(data[hover].value) : centerBottom}
        </div>
      </div>
    </div>
  );
}

/* ─── Barras agrupadas (ingresos vs gastos) ──────────────── */
function Bars({ series, height = 220, showIncome = true }) {
  const [mounted, setMounted] = _useSC(false);
  _useEC(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);
  const max     = Math.max(1, ...series.map((s) => Math.max(showIncome ? s.income : 0, s.expense)));
  const niceMax = max * 1.12;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, padding: "0 2px" }}>
      {series.map((s, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", width: "100%", height: "100%", justifyContent: "center" }}>
            {showIncome && (
              <div title={window.SharkyData.fmt(s.income)} style={{
                width: "42%", maxWidth: 18, borderRadius: "4px 4px 2px 2px",
                background: "var(--income)",
                height: mounted ? `${(s.income / niceMax) * 100}%` : 0,
                minHeight: s.income > 0 && mounted ? 3 : 0,
                transition: "height .55s cubic-bezier(.22,1,.36,1)" }} />
            )}
            <div title={window.SharkyData.fmt(s.expense)} style={{
              width: "42%", maxWidth: 18, borderRadius: "4px 4px 2px 2px",
              background: "var(--expense)",
              height: mounted ? `${(s.expense / niceMax) * 100}%` : 0,
              minHeight: s.expense > 0 && mounted ? 3 : 0,
              transition: "height .55s cubic-bezier(.22,1,.36,1)" }} />
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 8,
            textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {String(s.label).replace(".", "")}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Área / línea (sparkline de cuenta) ─────────────────── */
function AreaLine({ points, height = 120, color = "var(--accent)", fill = true }) {
  const W = 100, H = 100;
  const max   = Math.max(1, ...points);
  const min   = Math.min(...points, 0);
  const range = max - min || 1;
  const step  = points.length > 1 ? W / (points.length - 1) : W;
  const coords = points.map((p, i) => [i * step, H - ((p - min) / range) * H]);
  const line   = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const area   = `${line} L${W},${H} L0,${H} Z`;
  const gid    = "ag" + Math.random().toString(36).slice(2, 7);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`}
         preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Barra de progreso ──────────────────────────────────── */
function Progress({ value, max, color = "var(--accent)", height = 8 }) {
  const pct  = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const over = value > max && max > 0;
  return (
    <div style={{ background: "var(--track)", borderRadius: 999, height, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 999,
        background: over ? "var(--expense)" : color,
        transition: "width .5s ease",
      }} />
    </div>
  );
}

Object.assign(window, { Icon, Donut, Bars, AreaLine, Progress });
