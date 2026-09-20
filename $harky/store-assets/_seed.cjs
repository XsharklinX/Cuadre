var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/data/seed.ts
var seed_exports = {};
__export(seed_exports, {
  CURRENCIES: () => CURRENCIES,
  TODAY: () => TODAY,
  makeDemo: () => makeDemo,
  makeEmpty: () => makeEmpty,
  newId: () => newId
});
module.exports = __toCommonJS(seed_exports);
var TODAY = /* @__PURE__ */ new Date();
var CURRENCIES = {
  DOP: { code: "DOP", symbol: "RD$", decimals: 2 },
  USD: { code: "USD", symbol: "US$", decimals: 2 },
  EUR: { code: "EUR", symbol: "\u20AC", decimals: 2 },
  MXN: { code: "MXN", symbol: "MX$", decimals: 2 },
  GBP: { code: "GBP", symbol: "\xA3", decimals: 2 },
  COP: { code: "COP", symbol: "COP", decimals: 0 },
  ARS: { code: "ARS", symbol: "AR$", decimals: 0 },
  BRL: { code: "BRL", symbol: "R$", decimals: 2 },
  CAD: { code: "CAD", symbol: "CA$", decimals: 2 }
};
var ACCOUNTS_DEMO = [
  { id: "acc_popular", name: "Banco Principal", short: "D\xE9bito", type: "debit", color: "#3b82f6", balance: 84250.75, last4: "4821" },
  { id: "acc_bhd", name: "Banco de Ahorros", short: "Ahorros", type: "savings", color: "#22c55e", balance: 152800, last4: "1093" },
  { id: "acc_visa", name: "Visa Platino", short: "Cr\xE9dito", type: "credit", color: "#a78bfa", balance: -23410.4, last4: "7745", limit: 12e4 },
  { id: "acc_cash", name: "Efectivo", short: "Efectivo", type: "cash", color: "#f59e0b", balance: 6500, last4: null }
];
var ACCOUNTS_EMPTY = [
  { id: "acc_cash", name: "Efectivo", short: "Efectivo", type: "cash", color: "#f59e0b", balance: 0, last4: null }
];
var CATEGORIES_SEED = [
  { id: "cat_renta", name: "Vivienda", type: "expense", color: "#6366f1", budget: 0, icon: "home" },
  { id: "cat_super", name: "Supermercado", type: "expense", color: "#2dd4bf", budget: 0, icon: "cart" },
  { id: "cat_rest", name: "Restaurantes", type: "expense", color: "#f59e0b", budget: 0, icon: "food" },
  { id: "cat_trans", name: "Transporte", type: "expense", color: "#38bdf8", budget: 0, icon: "car" },
  { id: "cat_serv", name: "Servicios", type: "expense", color: "#c084fc", budget: 0, icon: "bolt" },
  { id: "cat_ocio", name: "Entretenimiento", type: "expense", color: "#f472b6", budget: 0, icon: "play" },
  { id: "cat_salud", name: "Salud", type: "expense", color: "#fb7185", budget: 0, icon: "heart" },
  { id: "cat_compras", name: "Compras", type: "expense", color: "#facc15", budget: 0, icon: "bag" },
  { id: "cat_edu", name: "Educaci\xF3n", type: "expense", color: "#818cf8", budget: 0, icon: "book" },
  { id: "cat_salario", name: "Salario", type: "income", color: "#22c55e", budget: 0, icon: "wallet" },
  { id: "cat_free", name: "Freelance", type: "income", color: "#34d399", budget: 0, icon: "laptop" },
  { id: "cat_inv", name: "Inversiones", type: "income", color: "#10b981", budget: 0, icon: "trend" }
];
var GOALS_SEED = [
  { id: "goal_viaje", name: "Viaje a la playa", target: 8e4, saved: 46500, color: "#38bdf8", deadline: "2026-12-01", icon: "play" },
  { id: "goal_emerg", name: "Fondo de emergencia", target: 2e5, saved: 132e3, color: "#22c55e", deadline: "2027-06-01", icon: "heart" },
  { id: "goal_laptop", name: "MacBook nueva", target: 11e4, saved: 28e3, color: "#a78bfa", deadline: "2026-09-01", icon: "laptop" }
];
var NOTES = {
  cat_renta: ["Alquiler"],
  cat_super: ["Supermercado", "Colmado", "Club de mayoristas", "Compras semanales"],
  cat_rest: ["Almuerzo fuera", "Cafeter\xEDa", "Cena con amigos", "Comida r\xE1pida", "Pedido a domicilio"],
  cat_trans: ["Gasolina", "Uber", "Peaje", "Estacionamiento", "Mantenimiento del carro"],
  cat_serv: ["Factura de luz", "Factura de agua", "Internet", "Plan telef\xF3nico", "Netflix"],
  cat_ocio: ["Cine", "Spotify", "Concierto", "Noche de bar", "Boliche"],
  cat_salud: ["Farmacia", "Consulta m\xE9dica", "Membres\xEDa del gimnasio", "An\xE1lisis de laboratorio"],
  cat_compras: ["Ropa", "Pedido de Amazon", "Tenis", "Regalo de cumplea\xF1os", "Ferreter\xEDa"],
  cat_edu: ["Curso en l\xEDnea", "Libros de texto", "Clase de idiomas"],
  cat_salario: ["Pago de n\xF3mina"],
  cat_free: ["Proyecto de dise\xF1o web", "Cliente de logo", "Consultor\xEDa"],
  cat_inv: ["Dividendos", "Inter\xE9s de ahorros"]
};
var EXPENSE_PLAN = [
  { cat: "cat_renta", count: 1, avg: 28e3, spread: 0 },
  { cat: "cat_super", count: 5, avg: 3600, spread: 0.35 },
  { cat: "cat_rest", count: 7, avg: 1300, spread: 0.5 },
  { cat: "cat_trans", count: 6, avg: 1e3, spread: 0.4 },
  { cat: "cat_serv", count: 5, avg: 1700, spread: 0.2 },
  { cat: "cat_ocio", count: 4, avg: 1100, spread: 0.5 },
  { cat: "cat_salud", count: 2, avg: 1500, spread: 0.4 },
  { cat: "cat_compras", count: 3, avg: 2300, spread: 0.6 },
  { cat: "cat_edu", count: 1, avg: 5e3, spread: 0.2 }
];
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var rng = makeRng(20260530);
var rand = (min, max) => min + (max - min) * rng();
var pick = (arr) => arr[Math.floor(rng() * arr.length)];
var jitter = (base, pct) => Math.round(base * (1 + (rng() - 0.5) * 2 * pct));
function newId(prefix = "tx_") {
  return prefix + Date.now().toString(36) + "_" + Math.floor(rng() * 1e6).toString(36);
}
function iso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function expenseAccount() {
  const r = rng();
  if (r < 0.5) return "acc_popular";
  if (r < 0.72) return "acc_visa";
  if (r < 0.88) return "acc_cash";
  return "acc_bhd";
}
function genTransactions() {
  const txns = [];
  for (let back = 11; back >= 0; back--) {
    const d0 = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1);
    const year = d0.getFullYear(), month = d0.getMonth();
    const isCur = back === 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const maxDay = isCur ? TODAY.getDate() : daysInMonth;
    for (const day of [15, daysInMonth]) {
      if (day <= maxDay)
        txns.push({
          id: newId(),
          type: "income",
          categoryId: "cat_salario",
          accountId: "acc_popular",
          amount: 42500,
          date: iso(year, month, day),
          note: "Pago de n\xF3mina"
        });
    }
    if (rng() < 0.6) {
      const day = Math.min(Math.floor(rand(5, 25)), maxDay);
      if (day >= 1)
        txns.push({
          id: newId(),
          type: "income",
          categoryId: "cat_free",
          accountId: "acc_bhd",
          amount: jitter(22e3, 0.4),
          date: iso(year, month, day),
          note: pick(NOTES.cat_free)
        });
    }
    if (month % 3 === 0)
      txns.push({
        id: newId(),
        type: "income",
        categoryId: "cat_inv",
        accountId: "acc_bhd",
        amount: jitter(4800, 0.3),
        date: iso(year, month, Math.min(28, maxDay)),
        note: pick(NOTES.cat_inv)
      });
    for (const p of EXPENSE_PLAN) {
      for (let i = 0; i < p.count; i++) {
        const day = p.cat === "cat_renta" ? 1 : Math.floor(rand(1, daysInMonth + 1));
        if (day > maxDay) continue;
        const amt = p.spread === 0 ? p.avg : Math.max(80, jitter(p.avg, p.spread));
        txns.push({
          id: newId(),
          type: "expense",
          categoryId: p.cat,
          accountId: p.cat === "cat_renta" ? "acc_popular" : expenseAccount(),
          amount: amt,
          date: iso(year, month, day),
          note: pick(NOTES[p.cat])
        });
      }
    }
  }
  return txns.sort((a, b) => a.date < b.date ? 1 : -1);
}
var clone = (x) => JSON.parse(JSON.stringify(x));
function makeDemo() {
  return {
    accounts: clone(ACCOUNTS_DEMO),
    categories: clone(CATEGORIES_SEED),
    goals: clone(GOALS_SEED),
    transactions: genTransactions()
  };
}
function makeEmpty() {
  return {
    accounts: clone(ACCOUNTS_EMPTY),
    categories: clone(CATEGORIES_SEED),
    goals: [],
    transactions: []
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CURRENCIES,
  TODAY,
  makeDemo,
  makeEmpty,
  newId
});
