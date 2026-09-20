/* ============================================================
   $harky — Vistas: Estadísticas, Presupuestos, Modal agregar/editar
   ============================================================ */
const { useState: useState2, useEffect: useEffect2 } = React;
const DD = () => window.SharkyData;

/* ═══════════════════════════════════════════════════════════
   ESTADÍSTICAS
   ═══════════════════════════════════════════════════════════ */
function Stats({ txns, mkey }) {
  const d = DD();
  const [range, setRange] = useState2("month");
  const year = Number(mkey.slice(0, 4));

  const monthTx = d.txForMonth(txns, mkey);
  const yearTx  = txns.filter((t) => t.date.slice(0, 4) === String(year));

  const activeTx   = range === "year" ? yearTx : monthTx;
  const rangeLabel = range === "year" ? String(year) : d.monthLabel(mkey);
  const t          = d.totals(activeTx);

  const catData = d.byCategory(activeTx, "expense").map((x) => ({
    label: x.category.name, value: x.amount, color: x.category.color, category: x.category,
  }));

  let series, seriesTitle, showIncome;
  if (range === "week") {
    series      = d.weeklySeries(monthTx).map((w) => ({ label: w.label, income: 0, expense: w.value }));
    seriesTitle = "Gasto semanal";
    showIncome  = false;
  } else {
    series      = d.monthlySeries(year).map((m) => ({ label: m.label, income: m.income, expense: m.expense }));
    seriesTitle = `Por mes · ${year}`;
    showIncome  = true;
  }

  const topCat = catData[0];

  return (
    <div className="view">
      <div className="toolbar">
        <div className="seg">
          {[["week","Semanal"],["month","Mensual"],["year","Anual"]].map(([v,l]) => (
            <button key={v} className={range === v ? "on" : ""} onClick={() => setRange(v)}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--text-dim)", textTransform:"capitalize" }}>
          {rangeLabel}
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom:16 }}>
        <MiniStat label="Total ingresos"    amount={t.income}  compact color="var(--income)"  />
        <MiniStat label="Total gastos"      amount={t.expense} compact color="var(--expense)" />
        <MiniStat label="Balance"           amount={t.net}     compact color="var(--accent)"  />
        <MiniStat label="Categoría top"     value={topCat ? topCat.label : "—"} color="var(--accent2)" />
      </div>

      <div className="grid-1-1">
        <Card title={seriesTitle} sub={showIncome ? "Ingresos vs gastos" : "Gasto por semana"}>
          <Bars series={series} showIncome={showIncome} height={240} />
          <div style={{ display:"flex", gap:18, marginTop:14, fontSize:12 }}>
            {showIncome && <Legend color="var(--income)"  label="Ingresos" />}
            <Legend color="var(--expense)" label="Gastos" />
          </div>
        </Card>

        <Card title="Gasto por categoría" sub={rangeLabel}>
          {catData.length === 0 ? <Empty text="Sin gastos en el periodo" /> : (
            <div style={{ display:"flex", gap:24, alignItems:"center", flexWrap:"wrap" }}>
              <Donut data={catData} centerTop="Total" centerBottom={d.fmtCompact(t.expense)} />
              <div style={{ flex:1, minWidth:170 }}>
                {catData.map((c, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:9, fontSize:12.5, padding:"5px 0" }}>
                    <span style={{ width:9, height:9, borderRadius:3, background:c.color, flex:"0 0 auto" }} />
                    <span style={{ flex:1, color:"var(--text)" }}>{c.label}</span>
                    <span style={{ color:"var(--text)", fontWeight:600, fontVariantNumeric:"tabular-nums" }}>
                      {d.fmtCompact(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Desglose con barras de progreso */}
      <Card title="Desglose por categoría" sub={rangeLabel} style={{ marginTop:16 }}>
        {catData.length === 0 ? <Empty text="Sin gastos en el periodo" /> : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {catData.map((c, i) => {
              const pct = t.expense > 0 ? (c.value / t.expense) * 100 : 0;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <CatBadge category={c.category} size={34} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                      <span style={{ color:"var(--text)", fontWeight:550 }}>{c.label}</span>
                      <span style={{ color:"var(--text)", fontWeight:650, fontVariantNumeric:"tabular-nums" }}>
                        {d.fmt(c.value, { decimals:0 })}
                        <span style={{ color:"var(--text-dim)", fontWeight:400, marginLeft:8 }}>{pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <Progress value={c.value} max={catData[0].value} height={6} color={c.color} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRESUPUESTOS
   ═══════════════════════════════════════════════════════════ */
function Budgets({ txns, mkey, onEditCats }) {
  const d = DD();
  const monthTx = d.txForMonth(txns, mkey);
  const spentMap = {};
  monthTx.forEach((t) => { if (t.type === "expense") spentMap[t.categoryId] = (spentMap[t.categoryId] || 0) + t.amount; });

  const budgetCats  = d.categories.filter((c) => c.type === "expense" && c.budget > 0);
  const totalBudget = budgetCats.reduce((s, c) => s + c.budget, 0);
  const totalSpent  = budgetCats.reduce((s, c) => s + (spentMap[c.id] || 0), 0);
  const remaining   = totalBudget - totalSpent;
  const pct         = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  const [yy, mm]  = mkey.split("-").map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const isCurrent   = mkey === d.currentMonthKey();
  const dayNow      = isCurrent ? d.TODAY.getDate() : daysInMonth;
  const projected   = dayNow > 0 ? (totalSpent / dayNow) * daysInMonth : totalSpent;

  return (
    <div className="view">
      <div className="reset-note">
        <Icon name="calendar" size={16} style={{ color:"var(--accent)", flexShrink:0 }} />
        <span>
          Los presupuestos se reinician automáticamente el día 1 de cada mes. Estás viendo{" "}
          <b style={{ color:"var(--text)", textTransform:"capitalize" }}>{d.monthLabel(mkey)}</b>
          {isCurrent ? ` · día ${dayNow} de ${daysInMonth}` : ""}.
        </span>
      </div>

      <div className="grid-2-1" style={{ marginTop:16 }}>
        <Card>
          <div style={{ display:"flex", alignItems:"center", gap:28, flexWrap:"wrap" }}>
            <Donut size={180} thickness={22}
              data={[
                { label:"Gastado",    value:totalSpent,              color: pct > 100 ? "var(--expense)" : "var(--accent)" },
                { label:"Disponible", value:Math.max(0, remaining),  color:"var(--track-strong)" },
              ]}
              centerTop={`${pct.toFixed(0)}%`}
              centerBottom={d.fmtCompact(totalSpent)} />

            <div style={{ flex:1, minWidth:200, display:"flex", flexDirection:"column", gap:16 }}>
              <BudgetLine label="Presupuesto total" value={d.fmt(totalBudget, { decimals:0 })} color="var(--text)" />
              <BudgetLine label="Gastado"           value={d.fmt(totalSpent,  { decimals:0 })} color="var(--expense)" />
              <BudgetLine label="Disponible"        value={d.fmt(remaining,   { decimals:0 })}
                color={remaining >= 0 ? "var(--income)" : "var(--expense)"} />
              {isCurrent && (
                <div style={{ fontSize:12, color:"var(--text-dim)", borderTop:"1px solid var(--border)", paddingTop:12 }}>
                  Proyección a fin de mes:{" "}
                  <b style={{ color: projected > totalBudget ? "var(--expense)" : "var(--text)" }}>
                    {d.fmtCompact(projected)}
                  </b>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Resumen" sub="Estado del mes">
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <SummaryRow label="En presupuesto"
              value={`${budgetCats.filter((c) => (spentMap[c.id] || 0) <= c.budget).length} / ${budgetCats.length}`} />
            <SummaryRow label="Sobre presupuesto"
              value={budgetCats.filter((c) => (spentMap[c.id] || 0) > c.budget).length}
              danger={budgetCats.some((c) => (spentMap[c.id] || 0) > c.budget)} />
            <SummaryRow label="% del mes transcurrido"
              value={isCurrent ? Math.round((dayNow / daysInMonth) * 100) + "%" : "100%"} />
            <SummaryRow label="Ritmo de gasto"
              value={pct > (dayNow / daysInMonth) * 100 ? "Acelerado ⚠" : "Saludable ✓"}
              danger={pct > (dayNow / daysInMonth) * 100 + 5} />
          </div>
        </Card>
      </div>

      <Card title="Presupuesto por categoría" sub={d.monthLabel(mkey)} style={{ marginTop:16 }}
        action={<button className="btn-ghost" onClick={onEditCats}>Editar categorías</button>}>
        <div style={{ display:"grid", gap:16 }}>
          {budgetCats.map((c) => {
            const spent = spentMap[c.id] || 0;
            const rem   = c.budget - spent;
            const cpct  = (spent / c.budget) * 100;
            const over  = spent > c.budget;
            return (
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:14 }}>
                <CatBadge category={c} size={38} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:7 }}>
                    <span style={{ fontSize:13.5, fontWeight:600, color:"var(--text)" }}>{c.name}</span>
                    <span style={{ fontSize:12.5, fontVariantNumeric:"tabular-nums",
                      color: over ? "var(--expense)" : "var(--text-dim)" }}>
                      <b style={{ color:"var(--text)" }}>{d.fmtCompact(spent)}</b> / {d.fmtCompact(c.budget)}
                    </span>
                  </div>
                  <Progress value={spent} max={c.budget} height={8} color={c.color} />
                </div>
                <div style={{ width:96, textAlign:"right", fontSize:12, fontVariantNumeric:"tabular-nums",
                  color: over ? "var(--expense)" : "var(--income)", fontWeight:600 }}>
                  {over ? `−${d.fmtCompact(Math.abs(rem))}` : d.fmtCompact(rem)}
                  <div style={{ fontSize:10.5, color:"var(--text-dim)", fontWeight:400 }}>
                    {over ? "excedido" : "disponible"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function BudgetLine({ label, value, color }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
      <span style={{ fontSize:13, color:"var(--text-dim)" }}>{label}</span>
      <span style={{ fontSize:16, fontWeight:700, color, fontVariantNumeric:"tabular-nums" }}>{value}</span>
    </div>
  );
}
function SummaryRow({ label, value, danger }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
      <span style={{ color:"var(--text-dim)" }}>{label}</span>
      <span style={{ fontWeight:650, color: danger ? "var(--expense)" : "var(--text)" }}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MODAL: AGREGAR / EDITAR TRANSACCIÓN
   ═══════════════════════════════════════════════════════════ */
function AddModal({ open, onClose, onSave, onDelete, editTx, mkey }) {
  const d      = DD();
  const isEdit = !!editTx;

  const [type,       setType]       = useState2("expense");
  const [amount,     setAmount]     = useState2("");
  const [categoryId, setCategoryId] = useState2("cat_super");
  const [accountId,  setAccountId]  = useState2("acc_popular");
  const [note,       setNote]       = useState2("");
  const [date,       setDate]       = useState2("");
  const [err,        setErr]        = useState2("");

  useEffect2(() => {
    if (!open) return;
    const today = d.currentMonthKey() + "-" + String(Math.min(d.TODAY.getDate(), 28)).padStart(2, "0");
    if (editTx) {
      setType(editTx.type); setAmount(String(editTx.amount));
      setNote(editTx.note || ""); setCategoryId(editTx.categoryId || "cat_super");
      setAccountId(editTx.accountId || "acc_popular"); setDate(editTx.date); setErr("");
    } else {
      setType("expense"); setAmount(""); setNote(""); setErr("");
      setCategoryId("cat_super"); setAccountId("acc_popular"); setDate(today);
    }
  }, [open]);

  if (!open) return null;

  const cats = d.categories.filter((c) => c.type === type);

  function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr("Ingresa un monto válido"); return; }
    const cat = cats.find((c) => c.id === categoryId) || cats[0];
    onSave({
      id: isEdit ? editTx.id : d.newId(),
      type, amount: amt,
      categoryId: cat?.id || categoryId,
      accountId, date,
      note: note.trim() || cat?.name || "",
    }, isEdit);
    onClose();
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:680 }}>
            {isEdit ? "Editar movimiento" : "Nuevo movimiento"}
          </h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        {/* Tipo */}
        <div className="seg seg-lg" style={{ marginBottom:20 }}>
          {[["expense","Gasto"],["income","Ingreso"]].map(([v,l]) => (
            <button key={v} className={type === v ? "on" : ""}
              onClick={() => { setType(v); const f = d.categories.find((c) => c.type === v); if (f) setCategoryId(f.id); }}>
              {l}
            </button>
          ))}
        </div>

        {/* Monto */}
        <label className="amount-field">
          <span>RD$</span>
          <input type="number" inputMode="decimal" autoFocus
            value={amount} placeholder="0.00"
            onChange={(e) => { setAmount(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {err && <div style={{ color:"var(--expense)", fontSize:12.5, marginTop:8 }}>{err}</div>}

        {/* Categoría */}
        <div className="field">
          <label>Categoría</label>
          <div className="cat-pick">
            {cats.map((c) => (
              <button key={c.id}
                className={"cat-opt" + (categoryId === c.id ? " on" : "")}
                onClick={() => setCategoryId(c.id)}
                style={categoryId === c.id
                  ? { borderColor:c.color, background:`color-mix(in oklab, ${c.color} 16%, transparent)` }
                  : {}}>
                <span style={{ color:c.color }}><Icon name={c.icon} size={17} /></span>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Cuenta + Fecha */}
        <div className="field-row">
          <div className="field" style={{ flex:1 }}>
            <label>Cuenta</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex:1 }}>
            <label>Fecha</label>
            <input className="select" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {/* Nota */}
        <div className="field">
          <label>Nota (opcional)</label>
          <input className="select" type="text" value={note}
            placeholder="Ej. Supermercado Nacional"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>

        {/* Acciones */}
        <div style={{ display:"flex", gap:10, marginTop:22 }}>
          {isEdit ? (
            <button className="btn-danger lg" style={{ flex:1 }}
              onClick={() => { onDelete(editTx.id); onClose(); }}>
              <Icon name="trash" size={15} />Eliminar
            </button>
          ) : (
            <button className="btn-ghost lg" style={{ flex:1 }} onClick={onClose}>Cancelar</button>
          )}
          <button className="btn-primary lg" style={{ flex:2 }} onClick={submit}>
            {isEdit ? "Guardar cambios" : `Guardar ${type === "expense" ? "gasto" : "ingreso"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Stats, Budgets, AddModal, BudgetLine, SummaryRow });
