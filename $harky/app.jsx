/* ============================================================
   $harky — App shell: navegación, routing, onboarding, estado
   ============================================================ */
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = {
  theme: "midnight",
  accent: "#3b82f6",
  density: "regular",
  font: "Plus Jakarta Sans",
  showSidebarLabels: true,
};

const NAV = [
  { id: "dashboard",    label: "Inicio",        icon: "grid"   },
  { id: "transactions", label: "Transacciones",  icon: "list"   },
  { id: "accounts",     label: "Cuentas",        icon: "cards"  },
  { id: "stats",        label: "Estadísticas",   icon: "chart"  },
  { id: "budgets",      label: "Presupuestos",   icon: "target" },
  { id: "goals",        label: "Metas",          icon: "trend"  },
];

function App() {
  const d     = window.SharkyData;
  const store = window.SharkyStore;

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tick, setTick] = useStateA(0);

  // routing
  const [view, setView]   = useStateA("dashboard");

  // modales
  const [addOpen,       setAddOpen]       = useStateA(false);
  const [editTx,        setEditTx]        = useStateA(null);
  const [transferOpen,  setTransferOpen]  = useStateA(false);
  const [catEditorOpen, setCatEditorOpen] = useStateA(false);

  // navegación de mes
  const [mkey, setMkey] = useStateA(d.currentMonthKey());

  // ── Inicialización ────────────────────────────────────────
  useEffectA(() => {
    store.setNotify(() => setTick((n) => n + 1));
    store.init();
    setTick((n) => n + 1); // forzar re-render tras cargar localStorage
  }, []);

  // ── Onboarding ────────────────────────────────────────────
  const themeProps = {
    "data-theme":   t.theme,
    "data-density": t.density,
    style: { "--accent": t.accent, fontFamily: `"${t.font}", system-ui, sans-serif` },
  };

  if (!store.hasSaved()) {
    return (
      <div className="app" {...themeProps}>
        <Welcome onChoose={(mode) => {
          if (mode === "demo") store.startDemo();
          else                 store.startEmpty();
        }} />
      </div>
    );
  }

  // ── Estado reactivo ───────────────────────────────────────
  const txns = d.transactions;
  const keys = d.monthKeys();
  const mIdx = keys.indexOf(mkey);

  // ── Handlers de transacciones ─────────────────────────────
  function handleSaveTx(tx, isEdit) {
    if (isEdit) {
      store.updateTx(tx.id, {
        type: tx.type, amount: tx.amount, categoryId: tx.categoryId,
        accountId: tx.accountId, date: tx.date, note: tx.note,
      });
      window.toast("Movimiento actualizado", { icon: "edit", type: "ok" });
    } else {
      store.addTx(tx);
      window.toast(
        tx.type === "income" ? "Ingreso guardado" : "Gasto guardado",
        { icon: tx.type === "income" ? "arrowUp" : "arrowDn", type: "ok" }
      );
    }
  }
  function handleDeleteTx(id) {
    store.deleteTx(id);
    window.toast("Movimiento eliminado", { icon: "trash" });
  }
  function openAdd()    { setEditTx(null); setAddOpen(true); }
  function openEdit(tx) { setEditTx(tx);   setAddOpen(true); }

  // ── Componente de vista activo ────────────────────────────
  const ViewComp = {
    dashboard:    Dashboard,
    transactions: Transactions,
    accounts:     Accounts,
    stats:        Stats,
    budgets:      Budgets,
    goals:        Goals,
  }[view] || Dashboard;

  const sharedProps = {
    txns, mkey,
    onAdd:      openAdd,
    goto:       setView,
    onEditTx:   openEdit,
    onTransfer: () => setTransferOpen(true),
    onEditCats: () => setCatEditorOpen(true),
  };

  return (
    <div className="app" {...themeProps}>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="shark" size={20} fill="currentColor" stroke={0} />
          </span>
          {t.showSidebarLabels && (
            <span className="brand-name">
              <span style={{ color: "var(--accent)" }}>$</span>harky
            </span>
          )}
        </div>

        <nav>
          {NAV.map((n) => (
            <button key={n.id}
              className={"nav-item" + (view === n.id ? " on" : "")}
              onClick={() => setView(n.id)}
              title={n.label}>
              <Icon name={n.icon} size={19} />
              {t.showSidebarLabels && <span>{n.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="add-fab" onClick={openAdd} title="Agregar movimiento">
            <Icon name="plus" size={18} stroke={2.6} />
            {t.showSidebarLabels && <span>Agregar</span>}
          </button>
          <div className="user-chip">
            <span className="avatar">JS</span>
            {t.showSidebarLabels && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Juan Santos</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Plan Personal</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{NAV.find((n) => n.id === view)?.label ?? "Inicio"}</h1>
            <p>Hola Juan, este es tu resumen financiero.</p>
          </div>
          <div className="topbar-right">
            {/* Selector de moneda */}
            <select className="select" value={d.activeCurrency}
              onChange={(e) => store.setCurrency(e.target.value)}
              style={{ fontSize: 12, padding: "6px 10px" }}>
              <option value="DOP">RD$ DOP</option>
              <option value="USD">US$ USD</option>
              <option value="EUR">€ EUR</option>
            </select>

            {/* Navegación de mes */}
            <div className="month-nav">
              <button disabled={mIdx <= 0}
                onClick={() => mIdx > 0 && setMkey(keys[mIdx - 1])}>
                <Icon name="arrowUp" size={15} style={{ transform: "rotate(-90deg)" }} />
              </button>
              <span>
                <Icon name="calendar" size={14} style={{ color: "var(--text-dim)" }} />
                {d.monthLabel(mkey)}
              </span>
              <button disabled={mIdx >= keys.length - 1}
                onClick={() => mIdx < keys.length - 1 && setMkey(keys[mIdx + 1])}>
                <Icon name="arrowUp" size={15} style={{ transform: "rotate(90deg)" }} />
              </button>
            </div>

            <button className="icon-btn ring" title="Notificaciones">
              <Icon name="bell" size={18} />
            </button>
            <button className="btn-primary" onClick={openAdd}>
              <Icon name="plus" size={16} stroke={2.4} />Agregar
            </button>
          </div>
        </header>

        <div className="scroll">
          <ViewComp {...sharedProps} />
        </div>
      </main>

      {/* ── Modales ── */}
      <AddModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditTx(null); }}
        onSave={handleSaveTx}
        onDelete={handleDeleteTx}
        editTx={editTx}
        mkey={mkey}
      />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
      <CategoryEditor open={catEditorOpen} onClose={() => setCatEditorOpen(false)} />

      {/* ── Toasts ── */}
      <ToastHost />

      {/* ── Panel de tweaks (tema, acento, densidad) ── */}
      <TweaksPanel title="Personalizar">
        <TweakSection label="Tema" />
        <TweakRadio label="Estilo" value={t.theme}
          options={["midnight", "slate", "carbon"]}
          onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Acento" value={t.accent}
          options={["#3b82f6", "#2563eb", "#06b6d4", "#7c93f0", "#22c55e", "#a78bfa"]}
          onChange={(v) => setTweak("accent", v)} />

        <TweakSection label="Diseño" />
        <TweakRadio label="Densidad" value={t.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSelect label="Tipografía" value={t.font}
          options={["Plus Jakarta Sans", "Manrope", "Space Grotesk"]}
          onChange={(v) => setTweak("font", v)} />
        <TweakToggle label="Etiquetas en menú" value={t.showSidebarLabels}
          onChange={(v) => setTweak("showSidebarLabels", v)} />

        <TweakSection label="Datos" />
        <TweakButton label="Cargar datos demo" secondary
          onClick={() => { store.startDemo(); window.toast("Datos demo cargados", { icon: "shark", type: "ok" }); }} />
        <TweakButton label="Limpiar todo" secondary
          onClick={() => { store.startEmpty(); window.toast("Datos limpiados", { icon: "trash" }); }} />
      </TweaksPanel>

    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
