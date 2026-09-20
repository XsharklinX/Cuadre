/* ============================================================
   $harky — Store: persistencia + mutaciones de estado
   window.SharkyStore
   ============================================================ */
(function () {
  "use strict";

  const KEY = "sharky_state_v1";
  const SD  = window.SharkyData;
  const st  = SD._state;
  let notify = function () {};

  // ── Serialización ─────────────────────────────────────────
  function snapshot() {
    return {
      transactions: st.transactions,
      accounts:     st.accounts,
      categories:   st.categories,
      goals:        st.goals,
      currency:     st.currency,
    };
  }
  function save()     { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (_) {} }
  function hasSaved() { return !!localStorage.getItem(KEY); }
  function resort()   { st.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); }
  function bump()     { resort(); save(); notify(); }

  function apply(data) {
    st.transactions = data.transactions || [];
    st.accounts     = data.accounts     || [];
    st.categories   = data.categories   || [];
    st.goals        = data.goals        || [];
    if (data.currency) st.currency = data.currency;
  }

  // ── Ajuste de saldos ──────────────────────────────────────
  function applyTx(tx, sign) {
    if (tx.type === "transfer") {
      const f = SD.getAccount(tx.fromAccount);
      const t = SD.getAccount(tx.toAccount);
      if (f) f.balance -= sign * tx.amount;
      if (t) t.balance += sign * tx.amount;
      return;
    }
    const a = SD.getAccount(tx.accountId);
    if (!a) return;
    if (tx.type === "income")  a.balance += sign * tx.amount;
    if (tx.type === "expense") a.balance -= sign * tx.amount;
  }

  const Store = {
    setNotify(fn)  { notify = fn; },
    hasSaved,

    init() {
      const raw = localStorage.getItem(KEY);
      if (raw) { try { apply(JSON.parse(raw)); resort(); } catch (_) {} }
    },

    startDemo()  { apply(SD.makeDemo());  bump(); },
    startEmpty() { apply(SD.makeEmpty()); bump(); },

    // ── Transacciones ────────────────────────────────────────
    addTx(tx) {
      st.transactions.unshift(tx);
      applyTx(tx, 1);
      bump();
    },
    updateTx(id, fields) {
      const i = st.transactions.findIndex((t) => t.id === id);
      if (i < 0) return;
      const old  = st.transactions[i];
      applyTx(old, -1);
      const next = Object.assign({}, old, fields);
      st.transactions[i] = next;
      applyTx(next, 1);
      bump();
    },
    deleteTx(id) {
      const i = st.transactions.findIndex((t) => t.id === id);
      if (i < 0) return;
      applyTx(st.transactions[i], -1);
      st.transactions.splice(i, 1);
      bump();
    },

    // ── Transferencias ───────────────────────────────────────
    transfer({ fromAccount, toAccount, amount, date, note }) {
      const tx = {
        id: SD.newId(), type: "transfer",
        amount, fromAccount, toAccount,
        date, note: note || "Transferencia",
      };
      st.transactions.unshift(tx);
      applyTx(tx, 1);
      bump();
    },

    // ── Metas ────────────────────────────────────────────────
    addGoal(g) {
      st.goals.push(Object.assign({ id: "goal_" + Date.now().toString(36), saved: 0 }, g));
      bump();
    },
    updateGoal(id, fields) {
      const g = st.goals.find((x) => x.id === id);
      if (g) Object.assign(g, fields);
      bump();
    },
    deleteGoal(id) {
      const i = st.goals.findIndex((x) => x.id === id);
      if (i >= 0) st.goals.splice(i, 1);
      bump();
    },
    contribute(goalId, amount, fromAccountId) {
      const g = st.goals.find((x) => x.id === goalId);
      if (!g) return;
      g.saved += amount;
      const a = SD.getAccount(fromAccountId);
      if (a) a.balance -= amount;
      bump();
    },

    // ── Categorías ───────────────────────────────────────────
    addCategory(c) {
      st.categories.push(Object.assign({ id: "cat_" + Date.now().toString(36) }, c));
      bump();
    },
    updateCategory(id, fields) {
      const c = SD.getCategory(id);
      if (c) Object.assign(c, fields);
      bump();
    },
    deleteCategory(id) {
      const i = st.categories.findIndex((x) => x.id === id);
      if (i >= 0) st.categories.splice(i, 1);
      bump();
    },

    // ── Moneda ───────────────────────────────────────────────
    setCurrency(code) { st.currency = code; bump(); },
  };

  window.SharkyStore = Store;
})();
