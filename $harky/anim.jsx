/* ============================================================
   $harky — Animaciones y sistema de toasts
   Exporta a window: AnimatedMoney, ToastHost, toast
   ============================================================ */
const { useState: _useSAn, useEffect: _useEAn, useRef: _useRAn } = React;

/* ─── Número animado con count-up ───────────────────────── */
function AnimatedMoney({ value, compact, decimals, style, className, animate = true }) {
  const [disp, setDisp] = _useSAn(animate ? 0 : value);
  const fromRef = _useRAn(animate ? 0 : value);

  _useEAn(() => {
    const from = fromRef.current, to = value;
    if (from === to) { setDisp(to); return; }
    const dur = 650, start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisp(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else { fromRef.current = to; setDisp(to); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = value; };
  }, [value]);

  const d    = window.SharkyData;
  const text = compact ? d.fmtCompact(disp) : d.fmt(disp, { decimals });
  return <span className={className} style={style}>{text}</span>;
}

/* ─── Sistema de toasts ──────────────────────────────────── */
let _toastFn = null;

function toast(msg, opts) {
  if (_toastFn) _toastFn(msg, opts || {});
}

function ToastHost() {
  const [items, setItems] = _useSAn([]);

  _useEAn(() => {
    _toastFn = (msg, opts) => {
      const id = Math.random().toString(36).slice(2);
      setItems((x) => [...x, Object.assign({ id, msg }, opts)]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), opts.duration || 2800);
    };
    // exponer en window para que views3 y store puedan llamarla
    window.toast = toast;
    return () => { _toastFn = null; };
  }, []);

  return (
    <div className="toast-host">
      {items.map((i) => (
        <div key={i.id} className={"toast" + (i.type ? " " + i.type : "")}>
          <Icon name={i.icon || "shark"} size={16} />
          <span>{i.msg}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { AnimatedMoney, ToastHost, toast });
