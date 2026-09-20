/* ============================================================
   $harky — Vistas: primitivos compartidos + Dashboard,
   Transacciones, Cuentas
   ============================================================ */
const { useState, useMemo } = React;
const D = () => window.SharkyData;

/* ─── Card ───────────────────────────────────────────────── */
function Card({ title, sub, action, children, style }) {
  return (
    <section className="card" style={style}>
      {(title || action) && (
        <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, gap:12 }}>
          <div>
            {title && <h3 style={{ margin:0, fontSize:14.5, fontWeight:650, color:"var(--text)" }}>{title}</h3>}
            {sub   && <p  style={{ margin:"3px 0 0", fontSize:12, color:"var(--text-dim)" }}>{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ─── CatBadge ───────────────────────────────────────────── */
function CatBadge({ category, size = 38 }) {
  if (!category) return null;
  return (
    <span style={{
      width:size, height:size, borderRadius:size*0.32, flex:"0 0 auto",
      display:"grid", placeItems:"center", color:category.color,
      background:`color-mix(in oklab, ${category.color} 18%, transparent)`,
    }}>
      <Icon name={category.icon} size={size * 0.5} stroke={2} />
    </span>
  );
}

/* ─── TxRow ──────────────────────────────────────────────── */
function TxRow({ tx, onClick }) {
  const d   = D();
  const day = new Date(tx.date + "T00:00:00");
  const fmt = { day:"2-digit", month:"short" };

  if (tx.type === "transfer") {
    const from = d.getAccount(tx.fromAccount), to = d.getAccount(tx.toAccount);
    return (
      <div className="txrow" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
        <span style={{ width:38, height:38, borderRadius:12, flex:"0 0 auto", display:"grid", placeItems:"center",
          color:"var(--accent)", background:"color-mix(in oklab, var(--accent) 16%, transparent)" }}>
          <Icon name="cards" size={19} />
        </span>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:13.5, fontWeight:550, color:"var(--text)" }}>Transferencia</div>
          <div style={{ fontSize:11.5, color:"var(--text-dim)", marginTop:2 }}>{from?.name} → {to?.name}</div>
        </div>
        <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
          <div style={{ fontSize:13.5, fontWeight:650, fontVariantNumeric:"tabular-nums", color:"var(--text-dim)" }}>
            {d.fmt(tx.amount, { decimals:0 })}
          </div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2 }}>{day.toLocaleDateString("es-DO", fmt)}</div>
        </div>
      </div>
    );
  }

  const cat    = d.getCategory(tx.categoryId);
  const acc    = d.getAccount(tx.accountId);
  const income = tx.type === "income";
  return (
    <div className="txrow" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <CatBadge category={cat} />
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontSize:13.5, fontWeight:550, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tx.note}</div>
        <div style={{ fontSize:11.5, color:"var(--text-dim)", marginTop:2 }}>{cat?.name} · {acc?.name}</div>
      </div>
      <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
        <div style={{ fontSize:13.5, fontWeight:650, fontVariantNumeric:"tabular-nums",
          color: income ? "var(--income)" : "var(--text)" }}>
          {income ? "+" : "−"}{d.fmt(tx.amount, { decimals:0 })}
        </div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2 }}>{day.toLocaleDateString("es-DO", fmt)}</div>
      </div>
    </div>
  );
}

/* ─── StatTile ───────────────────────────────────────────── */
function StatTile({ label, amount, value, icon, accent, delta, deltaGood, compact=true, decimals }) {
  return (
    <div className="card" style={{ padding:18, display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:"var(--text-dim)", fontWeight:500 }}>{label}</span>
        <span style={{ width:30, height:30, borderRadius:9, display:"grid", placeItems:"center",
          color:accent, background:`color-mix(in oklab, ${accent} 16%, transparent)` }}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div style={{ fontSize:23, fontWeight:720, color:"var(--text)", fontVariantNumeric:"tabular-nums", letterSpacing:"-.01em" }}>
        {amount != null ? <AnimatedMoney value={amount} compact={compact} decimals={decimals} /> : value}
      </div>
      {delta != null && (
        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11.5,
          color: deltaGood ? "var(--income)" : "var(--expense)" }}>
          <Icon name={deltaGood ? "arrowUp" : "arrowDn"} size={13} stroke={2.4} />
          <span style={{ fontWeight:600 }}>{delta}</span>
          <span style={{ color:"var(--text-dim)", fontWeight:400 }}>vs mes anterior</span>
        </div>
      )}
    </div>
  );
}

/* ─── MiniStat ───────────────────────────────────────────── */
function MiniStat({ label, amount, value, compact, decimals, color }) {
  return (
    <div className="card" style={{ padding:"14px 18px" }}>
      <div style={{ fontSize:11.5, color:"var(--text-dim)", marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, color, fontVariantNumeric:"tabular-nums" }}>
        {amount != null ? <AnimatedMoney value={amount} compact={compact} decimals={decimals} /> : value}
      </div>
    </div>
  );
}

/* ─── Legend + Empty ─────────────────────────────────────── */
function Legend({ color, label }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:7, color:"var(--text-dim)" }}>
      <span style={{ width:10, height:10, borderRadius:3, background:color }} />{label}
    </span>
  );
}
function Empty({ text }) {
  return <div style={{ padding:"30px 0", textAlign:"center", color:"var(--text-dim)", fontSize:13 }}>{text}</div>;
}

function pctChange(cur, prev) {
  if (!prev) return null;
  const p = ((cur - prev) / prev) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(0) + "%";
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
function Dashboard({ txns, mkey, onAdd, goto, onEditTx }) {
  const d       = D();
  const monthTx = d.txForMonth(txns, mkey);
  const t       = d.totals(monthTx);
  const netWorth = d.accounts.reduce((s, a) => s + a.balance, 0);

  const keys = d.monthKeys();
  const idx  = keys.indexOf(mkey);
  const prevTx = idx > 0 ? d.txForMonth(txns, keys[idx - 1]) : [];
  const pt     = d.totals(prevTx);

  const catData = d.byCategory(monthTx, "expense").map((x) => ({
    label: x.category.name, value: x.amount, color: x.category.color,
  }));

  const totalBudget = d.categories.filter((c) => c.type === "expense").reduce((s, c) => s + c.budget, 0);
  const budgetPct   = totalBudget > 0 ? (t.expense / totalBudget) * 100 : 0;
  const savingsRate = t.income > 0 ? (t.net / t.income) * 100 : 0;

  const year  = Number(mkey.slice(0, 4));
  const monthly    = d.monthlySeries(year);
  const curMonthNum = Number(mkey.slice(5, 7));
  const last6 = monthly.slice(Math.max(0, curMonthNum - 6), curMonthNum).map((m) => ({
    label: m.label, income: m.income, expense: m.expense,
  }));

  const recent = monthTx.slice(0, 6);

  return (
    <div className="view">
      {/* KPIs */}
      <div className="grid-4">
        <StatTile label="Patrimonio neto" amount={netWorth} icon="wallet" accent="var(--accent)" />
        <StatTile label="Ingresos del mes" amount={t.income} icon="arrowUp" accent="var(--income)"
          delta={pctChange(t.income, pt.income)} deltaGood={t.income >= pt.income} />
        <StatTile label="Gastos del mes"   amount={t.expense} icon="arrowDn" accent="var(--expense)"
          delta={pctChange(t.expense, pt.expense)} deltaGood={t.expense <= pt.expense} />
        <StatTile label="Ahorro del mes"   amount={t.net}    icon="trend" accent="var(--accent2)"
          delta={t.income > 0 ? savingsRate.toFixed(0) + "% tasa" : null} deltaGood={t.net >= 0} />
      </div>

      {/* Dona + Presupuesto */}
      <div className="grid-2-1" style={{ marginTop:16 }}>
        <Card title="Gasto por categoría" sub={d.monthLabel(mkey)}>
          {catData.length === 0 ? <Empty text="Sin gastos este mes" /> : (
            <div style={{ display:"flex", gap:26, alignItems:"center", flexWrap:"wrap" }}>
              <Donut data={catData} centerTop="Gastado" centerBottom={d.fmtCompact(t.expense)} />
              <div style={{ flex:1, minWidth:180, display:"flex", flexDirection:"column", gap:9 }}>
                {catData.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:12.5 }}>
                    <span style={{ width:9, height:9, borderRadius:3, background:c.color, flex:"0 0 auto" }} />
                    <span style={{ flex:1, color:"var(--text)" }}>{c.label}</span>
                    <span style={{ color:"var(--text-dim)", fontVariantNumeric:"tabular-nums" }}>
                      {((c.value / t.expense) * 100).toFixed(0)}%
                    </span>
                    <span style={{ color:"var(--text)", fontWeight:600, fontVariantNumeric:"tabular-nums", minWidth:72, textAlign:"right" }}>
                      {d.fmtCompact(c.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Presupuesto del mes" sub={`${budgetPct.toFixed(0)}% utilizado`}
          action={<button className="btn-ghost" onClick={() => goto("budgets")}>Ver todo</button>}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12.5, marginBottom:7 }}>
                <span style={{ color:"var(--text-dim)" }}>Total gastado</span>
                <span style={{ color:"var(--text)", fontWeight:600 }}>
                  {d.fmtCompact(t.expense)} <span style={{ color:"var(--text-dim)", fontWeight:400 }}>/ {d.fmtCompact(totalBudget)}</span>
                </span>
              </div>
              <Progress value={t.expense} max={totalBudget} height={9} color="var(--accent)" />
            </div>
            {d.byCategory(monthTx, "expense").slice(0, 4).map((x, i) => {
              const over = x.amount > x.category.budget;
              return (
                <div key={i}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
                    <span style={{ color:"var(--text)" }}>{x.category.name}</span>
                    <span style={{ color: over ? "var(--expense)" : "var(--text-dim)", fontVariantNumeric:"tabular-nums" }}>
                      {d.fmtCompact(x.amount)} / {d.fmtCompact(x.category.budget)}
                    </span>
                  </div>
                  <Progress value={x.amount} max={x.category.budget} height={6} color={x.category.color} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Barras + Recientes */}
      <div className="grid-2-1" style={{ marginTop:16 }}>
        <Card title="Ingresos vs Gastos" sub="Últimos 6 meses">
          <Bars series={last6} />
          <div style={{ display:"flex", gap:18, marginTop:14, fontSize:12 }}>
            <Legend color="var(--income)"  label="Ingresos" />
            <Legend color="var(--expense)" label="Gastos" />
          </div>
        </Card>

        <Card title="Movimientos recientes"
          action={<button className="btn-ghost" onClick={() => goto("transactions")}>Ver todo</button>}>
          {recent.length === 0 ? <Empty text="Sin movimientos este mes" /> : (
            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
              {recent.map((tx) => <TxRow key={tx.id} tx={tx} onClick={() => onEditTx && onEditTx(tx)} />)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TRANSACCIONES
   ═══════════════════════════════════════════════════════════ */
function Transactions({ txns, mkey, onAdd, onEditTx }) {
  const d = D();
  const [q,    setQ]    = useState("");
  const [type, setType] = useState("all");
  const [cat,  setCat]  = useState("all");
  const [exportOpen, setExportOpen] = useState(false);

  const monthTx = d.txForMonth(txns, mkey);
  const filtered = useMemo(() => monthTx.filter((tx) => {
    if (type !== "all" && tx.type !== type) return false;
    if (cat  !== "all" && tx.categoryId !== cat) return false;
    if (q) {
      const ql = q.toLowerCase();
      const inNote = (tx.note || "").toLowerCase().includes(ql);
      const inCat  = d.getCategory(tx.categoryId)?.name.toLowerCase().includes(ql);
      if (!inNote && !inCat) return false;
    }
    return true;
  }), [txns, mkey, q, type, cat]);

  const t = d.totals(filtered);

  // agrupar por día
  const groups = {};
  filtered.forEach((tx) => { (groups[tx.date] = groups[tx.date] || []).push(tx); });
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  function exportCSV() {
    const rows = [["Fecha", "Tipo", "Categoría", "Cuenta", "Nota", "Monto (DOP)"]];
    filtered.forEach((tx) => {
      rows.push([
        tx.date,
        tx.type === "income" ? "Ingreso" : tx.type === "transfer" ? "Transferencia" : "Gasto",
        d.getCategory(tx.categoryId)?.name || "—",
        tx.type === "transfer"
          ? `${d.getAccount(tx.fromAccount)?.name} -> ${d.getAccount(tx.toAccount)?.name}`
          : (d.getAccount(tx.accountId)?.name || "—"),
        (tx.note || "").replace(/"/g, "'"),
        (tx.type === "income" ? "" : "-") + tx.amount.toFixed(2),
      ]);
    });
    const csv  = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `sharky-${mkey}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    window.toast && window.toast("CSV exportado", { icon: "download", type: "ok" });
  }

  return (
    <div className="view">
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={16} style={{ color:"var(--text-dim)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar movimiento…" />
        </div>
        <div className="seg">
          {[["all","Todos"],["expense","Gastos"],["income","Ingresos"]].map(([v,l]) => (
            <button key={v} className={type === v ? "on" : ""} onClick={() => setType(v)}>{l}</button>
          ))}
        </div>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ position:"relative" }}>
          <button className="btn-ghost" style={{ padding:"9px 13px" }} onClick={() => setExportOpen((v) => !v)}>
            <Icon name="download" size={14} stroke={2.2} style={{ verticalAlign:"-2px", marginRight:5 }} />Exportar
          </button>
          {exportOpen && (
            <div className="menu-pop" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={exportCSV}><Icon name="download" size={15} />Descargar CSV</button>
              <button onClick={() => { setExportOpen(false); window.print(); }}><Icon name="print" size={15} />Imprimir / PDF</button>
            </div>
          )}
        </div>
        <button className="btn-primary" onClick={onAdd}><Icon name="plus" size={16} stroke={2.4} />Agregar</button>
      </div>

      {/* Mini stats */}
      <div className="grid-3" style={{ marginBottom:16 }}>
        <MiniStat label="Ingresos"    amount={t.income}  decimals={0} color="var(--income)"  />
        <MiniStat label="Gastos"      amount={t.expense} decimals={0} color="var(--expense)" />
        <MiniStat label="Balance neto" amount={t.net}   decimals={0} color="var(--text)"    />
      </div>

      <Card title={`${filtered.length} movimientos`} sub={d.monthLabel(mkey)}>
        {dates.length === 0 ? <Empty text="No hay movimientos con estos filtros" /> : (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            {dates.map((date) => {
              const dt       = new Date(date + "T00:00:00");
              const dayTotal = d.totals(groups[date]);
              return (
                <div key={date}>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"0 4px 8px",
                    fontSize:11.5, color:"var(--text-dim)", borderBottom:"1px solid var(--border)", marginBottom:4 }}>
                    <span style={{ textTransform:"capitalize", fontWeight:600 }}>
                      {dt.toLocaleDateString("es-DO", { weekday:"long", day:"2-digit", month:"long" })}
                    </span>
                    <span style={{ fontVariantNumeric:"tabular-nums" }}>{d.fmtCompact(dayTotal.net)}</span>
                  </div>
                  {groups[date].map((tx) => (
                    <TxRow key={tx.id} tx={tx} onClick={() => onEditTx && onEditTx(tx)} />
                  ))}
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
   CUENTAS
   ═══════════════════════════════════════════════════════════ */
function Accounts({ txns, onTransfer }) {
  const d        = D();
  const netWorth = d.accounts.reduce((s, a) => s + a.balance, 0);
  const assets   = d.accounts.filter((a) => a.balance >= 0).reduce((s, a) => s + a.balance, 0);
  const debt     = d.accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  const keys     = d.monthKeys();

  return (
    <div className="view">
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
        <button className="btn-ghost" style={{ padding:"9px 14px" }} onClick={onTransfer}>
          <Icon name="cards" size={15} style={{ verticalAlign:"-3px", marginRight:6 }} />
          Transferir entre cuentas
        </button>
      </div>

      <div className="grid-3" style={{ marginBottom:16 }}>
        <MiniStat label="Patrimonio neto" amount={netWorth} decimals={0} color="var(--accent)"  />
        <MiniStat label="Activos"         amount={assets}   decimals={0} color="var(--income)"  />
        <MiniStat label="Deudas"          amount={debt}     decimals={0} color="var(--expense)" />
      </div>

      <div className="grid-acc">
        {d.accounts.map((a) => {
          const series = keys.map((k) => {
            const tx = d.txForMonth(txns, k).filter((x) => x.accountId === a.id);
            return d.totals(tx).net;
          });
          const credit = a.type === "credit";
          const util   = credit && a.limit ? (Math.abs(a.balance) / a.limit) * 100 : null;

          return (
            <div key={a.id} className="card acct-card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <span style={{ width:40, height:40, borderRadius:11, display:"grid", placeItems:"center",
                    color:a.color, background:`color-mix(in oklab, ${a.color} 18%, transparent)` }}>
                    <Icon name={credit ? "cards" : "wallet"} size={20} />
                  </span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:650, color:"var(--text)" }}>{a.name}</div>
                    <div style={{ fontSize:11.5, color:"var(--text-dim)" }}>
                      {a.short}{a.last4 ? ` ·· ${a.last4}` : ""}
                    </div>
                  </div>
                </div>
                <Icon name="dots" size={18} style={{ color:"var(--text-dim)", cursor:"pointer" }} />
              </div>

              <div style={{ marginTop:18 }}>
                <div style={{ fontSize:11.5, color:"var(--text-dim)" }}>
                  {credit ? "Saldo a pagar" : "Saldo disponible"}
                </div>
                <div style={{ fontSize:26, fontWeight:720, marginTop:3, fontVariantNumeric:"tabular-nums",
                  color: a.balance < 0 ? "var(--expense)" : "var(--text)", letterSpacing:"-.01em" }}>
                  <AnimatedMoney value={a.balance} decimals={0} />
                </div>
              </div>

              {util != null && (
                <div style={{ marginTop:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text-dim)", marginBottom:6 }}>
                    <span>Uso de crédito</span>
                    <span>{util.toFixed(0)}% de {d.fmtCompact(a.limit)}</span>
                  </div>
                  <Progress value={Math.abs(a.balance)} max={a.limit} height={6}
                    color={util > 70 ? "var(--expense)" : a.color} />
                </div>
              )}

              <div style={{ marginTop:16 }}>
                <AreaLine points={series} height={46} color={a.color} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Card, CatBadge, TxRow, StatTile, MiniStat, Legend, Empty, Dashboard, Transactions, Accounts });
