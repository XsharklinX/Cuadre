/* ============================================================
   $harky — Capa de datos
   Datos demo realistas en DOP + helpers de cálculo.
   Todo expuesto en window.SharkyData
   ============================================================ */
(function () {
  "use strict";

  const TODAY = new Date(2026, 4, 30); // 30 may 2026

  // ── Cuentas ──────────────────────────────────────────────
  const ACCOUNTS_SEED = [
    { id: "acc_popular", name: "Banco Popular", short: "Débito",  type: "debit",   color: "#3b82f6", balance: 84250.75,   last4: "4821" },
    { id: "acc_bhd",     name: "BHD Ahorros",   short: "Ahorros", type: "savings", color: "#22c55e", balance: 152800.00,  last4: "1093" },
    { id: "acc_visa",    name: "Visa Platinum",  short: "Crédito", type: "credit",  color: "#a78bfa", balance: -23410.40, last4: "7745", limit: 120000 },
    { id: "acc_cash",    name: "Efectivo",       short: "Cash",    type: "cash",    color: "#f59e0b", balance: 6500.00,   last4: null },
  ];

  // ── Categorías ───────────────────────────────────────────
  const CATEGORIES_SEED = [
    // Gastos
    { id: "cat_renta",   name: "Vivienda",        type: "expense", color: "#6366f1", budget: 28000, icon: "home"   },
    { id: "cat_super",   name: "Supermercado",    type: "expense", color: "#2dd4bf", budget: 18000, icon: "cart"   },
    { id: "cat_rest",    name: "Restaurantes",    type: "expense", color: "#f59e0b", budget: 9000,  icon: "food"   },
    { id: "cat_trans",   name: "Transporte",      type: "expense", color: "#38bdf8", budget: 6000,  icon: "car"    },
    { id: "cat_serv",    name: "Servicios",       type: "expense", color: "#c084fc", budget: 8500,  icon: "bolt"   },
    { id: "cat_ocio",    name: "Entretenimiento", type: "expense", color: "#f472b6", budget: 4500,  icon: "play"   },
    { id: "cat_salud",   name: "Salud",           type: "expense", color: "#fb7185", budget: 3000,  icon: "heart"  },
    { id: "cat_compras", name: "Compras",         type: "expense", color: "#facc15", budget: 7000,  icon: "bag"    },
    { id: "cat_edu",     name: "Educación",       type: "expense", color: "#818cf8", budget: 5000,  icon: "book"   },
    // Ingresos
    { id: "cat_salario", name: "Salario",     type: "income", color: "#22c55e", budget: 0, icon: "wallet" },
    { id: "cat_free",    name: "Freelance",   type: "income", color: "#34d399", budget: 0, icon: "laptop" },
    { id: "cat_inv",     name: "Inversiones", type: "income", color: "#10b981", budget: 0, icon: "trend"  },
  ];

  // ── Notas realistas por categoría ────────────────────────
  const NOTES = {
    cat_renta:   ["Renta apartamento"],
    cat_super:   ["Bravo", "Nacional", "Jumbo", "La Sirena", "PriceSmart"],
    cat_rest:    ["Almuerzo Adrian Tropical", "Café Pizarrelli", "Cena con amigos", "Pollo Victorina", "Delivery PedidosYa"],
    cat_trans:   ["Gasolina", "Uber", "Peaje", "Parqueo", "Mantenimiento carro"],
    cat_serv:    ["Edesur (luz)", "CAASD (agua)", "Internet Claro", "Plan celular", "Netflix"],
    cat_ocio:    ["Cine Caribbean", "Spotify", "Concierto", "Bar Los Pinos", "Bolos"],
    cat_salud:   ["Farmacia Carol", "Consulta médica", "Gimnasio Body Shop", "Laboratorio"],
    cat_compras: ["Zara", "Amazon", "Sneakers", "Regalo cumpleaños", "Ferretería"],
    cat_edu:     ["Curso online", "Libros universitarios", "Mensualidad inglés"],
    cat_salario: ["Salario quincena"],
    cat_free:    ["Proyecto diseño web", "Logo cliente", "Consultoría"],
    cat_inv:     ["Dividendos", "Intereses ahorro"],
  };

  // ── PRNG determinista (mulberry32) ───────────────────────
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = makeRng(20260530);
  function rand(min, max) { return min + (max - min) * rng(); }
  function pick(arr)       { return arr[Math.floor(rng() * arr.length)]; }
  function jitter(base, pct) { return Math.round(base * (1 + (rng() - 0.5) * 2 * pct)); }

  // ── Plan mensual de gastos ────────────────────────────────
  const EXPENSE_PLAN = [
    { cat: "cat_renta",   count: 1, avg: 28000, spread: 0.00 },
    { cat: "cat_super",   count: 5, avg: 3600,  spread: 0.35 },
    { cat: "cat_rest",    count: 7, avg: 1300,  spread: 0.50 },
    { cat: "cat_trans",   count: 6, avg: 1000,  spread: 0.40 },
    { cat: "cat_serv",    count: 5, avg: 1700,  spread: 0.20 },
    { cat: "cat_ocio",    count: 4, avg: 1100,  spread: 0.50 },
    { cat: "cat_salud",   count: 2, avg: 1500,  spread: 0.40 },
    { cat: "cat_compras", count: 3, avg: 2300,  spread: 0.60 },
    { cat: "cat_edu",     count: 1, avg: 5000,  spread: 0.20 },
  ];

  function newId() {
    return "tx_" + Date.now().toString(36) + "_" + Math.floor(rng() * 1e6).toString(36);
  }
  function expenseAccount() {
    const r = rng();
    if (r < 0.50) return "acc_popular";
    if (r < 0.72) return "acc_visa";
    if (r < 0.88) return "acc_cash";
    return "acc_bhd";
  }
  function iso(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function genTransactions() {
    const txns = [];
    for (let back = 11; back >= 0; back--) {
      const date0  = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1);
      const year   = date0.getFullYear();
      const month  = date0.getMonth();
      const isCur  = back === 0;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const maxDay = isCur ? TODAY.getDate() : daysInMonth;

      // Salario quincena (días 15 y fin de mes)
      [15, daysInMonth].forEach((day) => {
        if (day <= maxDay) {
          txns.push({ id: newId(), type: "income", categoryId: "cat_salario",
            accountId: "acc_popular", amount: 42500,
            date: iso(year, month, day), note: "Salario quincena" });
        }
      });
      // Freelance (~60% de los meses)
      if (rng() < 0.6) {
        const day = Math.min(Math.floor(rand(5, 25)), maxDay);
        if (day >= 1) txns.push({ id: newId(), type: "income", categoryId: "cat_free",
          accountId: "acc_bhd", amount: jitter(22000, 0.4),
          date: iso(year, month, day), note: pick(NOTES.cat_free) });
      }
      // Inversiones (~trimestral)
      if (month % 3 === 0) {
        txns.push({ id: newId(), type: "income", categoryId: "cat_inv",
          accountId: "acc_bhd", amount: jitter(4800, 0.3),
          date: iso(year, month, Math.min(28, maxDay)), note: pick(NOTES.cat_inv) });
      }
      // Gastos
      EXPENSE_PLAN.forEach((p) => {
        for (let i = 0; i < p.count; i++) {
          const day = p.cat === "cat_renta" ? 1 : Math.floor(rand(1, daysInMonth + 1));
          if (day > maxDay) continue;
          const amt = p.spread === 0 ? p.avg : Math.max(80, jitter(p.avg, p.spread));
          txns.push({ id: newId(), type: "expense", categoryId: p.cat,
            accountId: p.cat === "cat_renta" ? "acc_popular" : expenseAccount(),
            amount: amt, date: iso(year, month, day), note: pick(NOTES[p.cat]) });
        }
      });
    }
    txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return txns;
  }

  // ── Metas de ahorro (demo) ────────────────────────────────
  const GOALS_SEED = [
    { id: "goal_viaje",  name: "Viaje a Punta Cana",  target: 80000,  saved: 46500,  color: "#38bdf8", deadline: "2026-12-01", icon: "play"   },
    { id: "goal_emerg",  name: "Fondo de emergencia", target: 200000, saved: 132000, color: "#22c55e", deadline: "2027-06-01", icon: "heart"  },
    { id: "goal_laptop", name: "MacBook nueva",        target: 110000, saved: 28000,  color: "#a78bfa", deadline: "2026-09-01", icon: "laptop" },
  ];

  // ── Monedas ───────────────────────────────────────────────
  const CURRENCIES = {
    DOP: { code: "DOP", symbol: "RD$", rate: 1,        decimals: 2 },
    USD: { code: "USD", symbol: "US$", rate: 1 / 60,   decimals: 2 },
    EUR: { code: "EUR", symbol: "€",   rate: 1 / 65.5, decimals: 2 },
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function makeDemo() {
    return {
      accounts: clone(ACCOUNTS_SEED),
      categories: clone(CATEGORIES_SEED),
      goals: clone(GOALS_SEED),
      transactions: genTransactions(),
    };
  }
  function makeEmpty() {
    return {
      accounts: clone(ACCOUNTS_SEED).map((a) => ({ ...a, balance: 0 })),
      categories: clone(CATEGORIES_SEED),
      goals: [],
      transactions: [],
    };
  }

  // ── Estado mutable (el store lo reemplaza vía apply) ─────
  const state = Object.assign({ currency: "DOP" }, makeDemo());

  // ── Helpers de formato ────────────────────────────────────
  function cur()  { return CURRENCIES[state.currency] || CURRENCIES.DOP; }
  function fmt(n, opts) {
    opts = opts || {};
    const c = cur();
    const v = n * c.rate;
    const sign = v < 0 ? "-" : "";
    const abs  = Math.abs(v);
    const dec  = opts.decimals != null ? opts.decimals : c.decimals;
    const s = abs.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return `${sign}${c.symbol} ${s}`;
  }
  function fmtCompact(n) {
    const c = cur();
    const v = n * c.rate;
    const abs  = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${c.symbol} ${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}${c.symbol} ${(abs / 1_000).toFixed(1)}k`;
    return `${sign}${c.symbol} ${Math.round(abs)}`;
  }

  // ── Helpers de fecha / mes ────────────────────────────────
  function monthKey(dateStr)   { return dateStr.slice(0, 7); }
  function currentMonthKey()  {
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-DO", { month: "long", year: "numeric" });
  }
  function shortMonth(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-DO", { month: "short" });
  }

  // ── Lookups ───────────────────────────────────────────────
  function getCategory(id) { return state.categories.find((c) => c.id === id); }
  function getAccount(id)  { return state.accounts.find((a) => a.id === id); }
  function txForMonth(txns, key) { return txns.filter((t) => monthKey(t.date) === key); }

  function totals(txns) {
    let income = 0, expense = 0;
    txns.forEach((t) => {
      if (t.type === "income")  income  += t.amount;
      else if (t.type === "expense") expense += t.amount;
    });
    return { income, expense, net: income - expense };
  }

  function byCategory(txns, type) {
    const map = {};
    txns.forEach((t) => {
      if (type && t.type !== type) return;
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([id, amount]) => ({ category: getCategory(id), amount }))
      .filter((x) => x.category)
      .sort((a, b) => b.amount - a.amount);
  }

  function monthKeys() {
    const set = new Set(state.transactions.map((t) => monthKey(t.date)));
    set.add(currentMonthKey());
    return Array.from(set).sort();
  }

  function monthlySeries(year) {
    const out = [];
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      const tx  = txForMonth(state.transactions, key);
      const t   = totals(tx);
      out.push({ key, label: shortMonth(key), ...t });
    }
    return out;
  }

  function weeklySeries(txns) {
    const buckets = [0, 0, 0, 0, 0];
    txns.forEach((t) => {
      if (t.type !== "expense") return;
      const day = Number(t.date.slice(8, 10));
      buckets[Math.min(4, Math.floor((day - 1) / 7))] += t.amount;
    });
    return buckets.map((v, i) => ({ label: `Sem ${i + 1}`, value: v }));
  }

  window.SharkyData = {
    TODAY, CURRENCIES, makeDemo, makeEmpty, _state: state,
    get accounts()    { return state.accounts; },
    get categories()  { return state.categories; },
    get transactions(){ return state.transactions; },
    get goals()       { return state.goals; },
    get activeCurrency()    { return state.currency; },
    set activeCurrency(v)   { state.currency = v; },
    fmt, fmtCompact, monthKey, currentMonthKey, monthLabel, shortMonth,
    getCategory, getAccount, txForMonth, totals, byCategory,
    monthKeys, monthlySeries, weeklySeries, newId,
  };
})();
