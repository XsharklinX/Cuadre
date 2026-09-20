/* ============================================================
   $harky — Vistas: Metas, Transferencia, Editor categorías,
   Onboarding Welcome, EmptyState
   ============================================================ */
const { useState: useState3, useEffect: useEffect3 } = React;
const D3  = () => window.SharkyData;
const ST  = () => window.SharkyStore;

/* ─── EmptyState ─────────────────────────────────────────── */
function EmptyState({ icon, title, text, cta, onCta }) {
  return (
    <div className="empty-state">
      <span className="empty-ico"><Icon name={icon || "shark"} size={30} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {cta && (
        <button className="btn-primary lg" onClick={onCta} style={{ marginTop:4 }}>
          <Icon name="plus" size={16} stroke={2.4} />{cta}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   METAS DE AHORRO
   ═══════════════════════════════════════════════════════════ */
function Goals() {
  const d     = D3();
  const goals = d.goals;
  const [contrib, setContrib] = useState3(null);
  const [form,    setForm]    = useState3(null);

  const totalSaved  = goals.reduce((s, g) => s + g.saved,  0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);

  return (
    <div className="view">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div className="grid-3" style={{ flex:1, minWidth:280 }}>
          <MiniStat label="Ahorrado total" amount={totalSaved}  decimals={0} color="var(--income)" />
          <MiniStat label="Meta total"     amount={totalTarget} decimals={0} color="var(--text)"   />
          <MiniStat label="Progreso"
            value={totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) + "%" : "—"}
            color="var(--accent)" />
        </div>
        <button className="btn-primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} stroke={2.4} />Nueva meta
        </button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <EmptyState icon="target" title="Aún no tienes metas"
            text="Crea una meta de ahorro (un viaje, un fondo de emergencia, un equipo nuevo) y registra tus aportes."
            cta="Crear primera meta" onCta={() => setForm({})} />
        </Card>
      ) : (
        <div className="grid-acc">
          {goals.map((g) => {
            const pct  = Math.min(100, (g.saved / g.target) * 100);
            const rem  = g.target - g.saved;
            const done = g.saved >= g.target;
            const dl   = g.deadline ? new Date(g.deadline + "T00:00:00") : null;
            return (
              <div key={g.id} className="card goal-card">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                    <span style={{ width:40, height:40, borderRadius:12, display:"grid", placeItems:"center",
                      color:g.color, background:`color-mix(in oklab, ${g.color} 18%, transparent)` }}>
                      <Icon name={g.icon || "target"} size={20} />
                    </span>
                    <div>
                      <div style={{ fontSize:14.5, fontWeight:650, color:"var(--text)" }}>{g.name}</div>
                      <div style={{ fontSize:11.5, color:"var(--text-dim)" }}>
                        {dl ? dl.toLocaleDateString("es-DO", { month:"long", year:"numeric" }) : "Sin fecha"}
                      </div>
                    </div>
                  </div>
                  <button className="icon-btn" style={{ width:30, height:30 }} onClick={() => setForm(g)}>
                    <Icon name="dots" size={16} />
                  </button>
                </div>

                <div style={{ marginTop:18, display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
                  <span style={{ fontSize:22, fontWeight:720, fontVariantNumeric:"tabular-nums", color:"var(--text)" }}>
                    <AnimatedMoney value={g.saved} decimals={0} />
                  </span>
                  <span style={{ fontSize:12.5, color:"var(--text-dim)" }}>de {D3().fmtCompact(g.target)}</span>
                </div>
                <div style={{ marginTop:10 }}><Progress value={g.saved} max={g.target} height={9} color={g.color} /></div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:9, fontSize:12 }}>
                  <span style={{ color: done ? "var(--income)" : "var(--text-dim)", fontWeight:600 }}>
                    {done ? "¡Meta cumplida! 🎉" : `${pct.toFixed(0)}% completado`}
                  </span>
                  {!done && <span style={{ color:"var(--text-dim)" }}>Faltan {D3().fmtCompact(rem)}</span>}
                </div>
                <button className="btn-soft" style={{ marginTop:16 }}
                  onClick={() => setContrib(g)} disabled={done}>
                  <Icon name="plus" size={15} stroke={2.3} />Aportar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ContributeModal goal={contrib} onClose={() => setContrib(null)} />
      <GoalForm goal={form} onClose={() => setForm(null)} />
    </div>
  );
}

/* ─── ContributeModal ────────────────────────────────────── */
function ContributeModal({ goal, onClose }) {
  const d = D3();
  const [amount, setAmount] = useState3("");
  const [acc,    setAcc]    = useState3("acc_bhd");
  useEffect3(() => { if (goal) { setAmount(""); setAcc("acc_bhd"); } }, [goal]);
  if (!goal) return null;

  function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    ST().contribute(goal.id, amt, acc);
    window.toast && window.toast(`Aportaste ${d.fmtCompact(amt)} a "${goal.name}"`, { icon:"target", type:"ok" });
    onClose();
  }
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth:400 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:680 }}>Aportar a {goal.name}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <label className="amount-field">
          <span>RD$</span>
          <input type="number" autoFocus value={amount} placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <div className="field">
          <label>Desde la cuenta</label>
          <select className="select" value={acc} onChange={(e) => setAcc(e.target.value)}>
            {d.accounts.filter((a) => a.type !== "credit").map((a) => (
              <option key={a.id} value={a.id}>{a.name} · {d.fmtCompact(a.balance)}</option>
            ))}
          </select>
        </div>
        <div style={{ display:"flex", gap:10, marginTop:22 }}>
          <button className="btn-ghost lg" onClick={onClose} style={{ flex:1 }}>Cancelar</button>
          <button className="btn-primary lg" onClick={submit} style={{ flex:2 }}>Aportar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── GoalForm ───────────────────────────────────────────── */
const GOAL_COLORS = ["#38bdf8","#22c55e","#a78bfa","#f59e0b","#f472b6","#2dd4bf"];
function GoalForm({ goal, onClose }) {
  const isEdit = goal && goal.id;
  const [name,     setName]     = useState3("");
  const [target,   setTarget]   = useState3("");
  const [color,    setColor]    = useState3(GOAL_COLORS[0]);
  const [deadline, setDeadline] = useState3("");

  useEffect3(() => {
    if (goal) {
      setName(goal.name || ""); setTarget(goal.target ? String(goal.target) : "");
      setColor(goal.color || GOAL_COLORS[0]); setDeadline(goal.deadline || "");
    }
  }, [goal]);
  if (!goal) return null;

  function submit() {
    const tgt = parseFloat(target);
    if (!name.trim() || !tgt || tgt <= 0) return;
    if (isEdit) ST().updateGoal(goal.id, { name:name.trim(), target:tgt, color, deadline });
    else {
      ST().addGoal({ name:name.trim(), target:tgt, color, deadline, icon:"target" });
      window.toast && window.toast("Meta creada", { icon:"target", type:"ok" });
    }
    onClose();
  }
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth:420 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:680 }}>{isEdit ? "Editar meta" : "Nueva meta"}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="field" style={{ marginTop:0 }}>
          <label>Nombre</label>
          <input className="select" autoFocus value={name} placeholder="Ej. Viaje a Punta Cana"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex:1 }}>
            <label>Meta (RD$)</label>
            <input className="select" type="number" value={target} placeholder="80000"
              onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="field" style={{ flex:1 }}>
            <label>Fecha límite</label>
            <input className="select" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Color</label>
          <div style={{ display:"flex", gap:9 }}>
            {GOAL_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ width:30, height:30, borderRadius:9,
                background:c, border: color === c ? "2px solid var(--text)" : "2px solid transparent", cursor:"pointer" }} />
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:10, marginTop:22 }}>
          {isEdit
            ? <button className="btn-danger lg" style={{ flex:1 }}
                onClick={() => { ST().deleteGoal(goal.id); onClose(); }}>
                <Icon name="trash" size={15} />Eliminar
              </button>
            : <button className="btn-ghost lg" style={{ flex:1 }} onClick={onClose}>Cancelar</button>}
          <button className="btn-primary lg" style={{ flex:2 }} onClick={submit}>
            {isEdit ? "Guardar" : "Crear meta"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TRANSFERENCIA ENTRE CUENTAS
   ═══════════════════════════════════════════════════════════ */
function TransferModal({ open, onClose }) {
  const d = D3();
  const [from,   setFrom]   = useState3("acc_bhd");
  const [to,     setTo]     = useState3("acc_popular");
  const [amount, setAmount] = useState3("");
  const [date,   setDate]   = useState3("");

  useEffect3(() => {
    if (open) {
      setAmount(""); setFrom("acc_bhd"); setTo("acc_popular");
      setDate(d.currentMonthKey() + "-" + String(Math.min(d.TODAY.getDate(), 28)).padStart(2, "0"));
    }
  }, [open]);
  if (!open) return null;

  function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || from === to) return;
    ST().transfer({ fromAccount:from, toAccount:to, amount:amt, date, note:"Transferencia" });
    window.toast && window.toast("Transferencia realizada", { icon:"cards", type:"ok" });
    onClose();
  }
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth:420 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:680 }}>Transferencia</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <label className="amount-field">
          <span>RD$</span>
          <input type="number" autoFocus value={amount} placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <div className="field-row">
          <div className="field" style={{ flex:1 }}>
            <label>Desde</label>
            <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
              {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex:1 }}>
            <label>Hacia</label>
            <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {from === to && (
          <div style={{ color:"var(--expense)", fontSize:12.5, marginTop:10 }}>Elige cuentas distintas</div>
        )}
        <div className="field">
          <label>Fecha</label>
          <input className="select" type="date" value={date}
            onChange={(e) => setDate(e.target.value)} style={{ width:"100%" }} />
        </div>
        <div style={{ display:"flex", gap:10, marginTop:22 }}>
          <button className="btn-ghost lg" onClick={onClose} style={{ flex:1 }}>Cancelar</button>
          <button className="btn-primary lg" onClick={submit} style={{ flex:2 }}>Transferir</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EDITOR DE CATEGORÍAS Y PRESUPUESTOS
   ═══════════════════════════════════════════════════════════ */
const CAT_ICONS  = ["home","cart","food","car","bolt","play","heart","bag","book","trend","wallet","laptop"];
const CAT_COLORS = ["#6366f1","#2dd4bf","#f59e0b","#38bdf8","#c084fc","#f472b6","#fb7185","#facc15","#818cf8","#22c55e"];

function CategoryEditor({ open, onClose }) {
  const d = D3();
  const [, force]   = useState3(0);
  const [adding, setAdding] = useState3(false);
  const [nName,  setNName]  = useState3("");
  const [nBudget,setNBudget]= useState3("");
  const [nColor, setNColor] = useState3(CAT_COLORS[0]);
  const [nIcon,  setNIcon]  = useState3(CAT_ICONS[0]);

  if (!open) return null;
  const cats = d.categories.filter((c) => c.type === "expense");

  function setBudget(id, v) {
    ST().updateCategory(id, { budget: parseFloat(v) || 0 });
    force((x) => x + 1);
  }
  function addCat() {
    if (!nName.trim()) return;
    ST().addCategory({ name:nName.trim(), type:"expense", budget:parseFloat(nBudget)||0, color:nColor, icon:nIcon });
    setNName(""); setNBudget(""); setAdding(false); force((x) => x + 1);
    window.toast && window.toast("Categoría creada", { icon:"bag", type:"ok" });
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth:540 }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:680 }}>Categorías y presupuestos</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:"48vh", overflowY:"auto", paddingRight:4 }}>
          {cats.map((c) => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <CatBadge category={c} size={34} />
              <span style={{ flex:1, fontSize:13.5, fontWeight:550, color:"var(--text)" }}>{c.name}</span>
              <div className="budget-input">
                <span>RD$</span>
                <input type="number" value={c.budget}
                  onChange={(e) => setBudget(c.id, e.target.value)} />
              </div>
              <button className="icon-btn" style={{ width:32, height:32 }} title="Eliminar"
                onClick={() => { ST().deleteCategory(c.id); force((x) => x + 1); }}>
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>

        {adding ? (
          <div style={{ marginTop:16, padding:14, border:"1px solid var(--border)", borderRadius:12 }}>
            <div className="field-row" style={{ marginTop:0 }}>
              <div className="field" style={{ flex:2, marginTop:0 }}>
                <label>Nombre</label>
                <input className="select" autoFocus value={nName} placeholder="Ej. Mascotas"
                  onChange={(e) => setNName(e.target.value)} />
              </div>
              <div className="field" style={{ flex:1, marginTop:0 }}>
                <label>Presupuesto</label>
                <input className="select" type="number" value={nBudget} placeholder="3000"
                  onChange={(e) => setNBudget(e.target.value)} />
              </div>
            </div>
            <div style={{ display:"flex", gap:14, marginTop:12, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:6 }}>Color</div>
                <div style={{ display:"flex", gap:6 }}>
                  {CAT_COLORS.slice(0, 6).map((c) => (
                    <button key={c} onClick={() => setNColor(c)} style={{ width:24, height:24, borderRadius:7,
                      background:c, border: nColor === c ? "2px solid var(--text)" : "2px solid transparent", cursor:"pointer" }} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:6 }}>Ícono</div>
                <div style={{ display:"flex", gap:6 }}>
                  {CAT_ICONS.slice(0, 6).map((ic) => (
                    <button key={ic} className="icon-btn" style={{ width:30, height:30,
                      color: nIcon === ic ? "var(--accent)" : "var(--text-dim)",
                      borderColor: nIcon === ic ? "var(--accent)" : "var(--border)" }}
                      onClick={() => setNIcon(ic)}>
                      <Icon name={ic} size={15} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setAdding(false)}>Cancelar</button>
              <button className="btn-primary" style={{ flex:1, justifyContent:"center" }} onClick={addCat}>Agregar</button>
            </div>
          </div>
        ) : (
          <button className="btn-soft" style={{ marginTop:16 }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} stroke={2.3} />Nueva categoría
          </button>
        )}

        <button className="btn-primary lg" onClick={onClose} style={{ width:"100%", marginTop:18 }}>Listo</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WELCOME / ONBOARDING
   ═══════════════════════════════════════════════════════════ */
function Welcome({ onChoose }) {
  return (
    <div className="welcome-overlay">
      <div className="welcome">
        <span className="welcome-mark">
          <Icon name="shark" size={32} fill="currentColor" stroke={0} />
        </span>
        <h1><span style={{ color:"var(--accent)" }}>$</span>harky</h1>
        <p>Tu dinero, claro como el agua. Registra ingresos y gastos, controla presupuestos y visualiza tus finanzas en gráficas.</p>
        <div className="welcome-actions">
          <button className="btn-primary lg" onClick={() => onChoose("demo")}>
            <Icon name="chart" size={17} />Explorar con datos de ejemplo
          </button>
          <button className="btn-ghost lg" onClick={() => onChoose("empty")}>
            Empezar de cero
          </button>
        </div>
        <div className="welcome-feats">
          <span><Icon name="chart"  size={15} style={{ color:"var(--accent)", flexShrink:0 }} /> Gráficas semanales, mensuales y anuales</span>
          <span><Icon name="target" size={15} style={{ color:"var(--accent)", flexShrink:0 }} /> Presupuestos que se reinician cada mes</span>
          <span><Icon name="cards"  size={15} style={{ color:"var(--accent)", flexShrink:0 }} /> Cuentas, metas de ahorro y transferencias</span>
          <span><Icon name="trend"  size={15} style={{ color:"var(--accent)", flexShrink:0 }} /> Multi-moneda: DOP, USD y EUR</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EmptyState, Goals, ContributeModal, GoalForm, TransferModal, CategoryEditor, Welcome });
