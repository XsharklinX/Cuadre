# Design Research: Personal Finance Apps — $harky

*Research date: 2026-05-31 | Target: dark-mode fintech, desktop+mobile, LATAM/RD*

---

## TL;DR

The gap between a generic budget app and a premium one is not features — it's **the feeling of control**. Copilot, Monarch, and Revolut make users feel in control by showing exactly three things instantly: current state, what needs attention, and what to do next. $harky has the data layer; what it needs is the *presentation layer* that turns numbers into decisions.

---

## Recommendations (Priority Order)

### 1. Dashboard: Información de alto impacto en 3 segundos

El 80% de las sesiones duran menos de 90 segundos. El usuario abre la app para "revisar" rápido, no para analizar.

```
┌──────────────────────────────────────────────────┐
│  Mayo 2026          Patrimonio: RD$ 220,140 ↑    │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Ingresos │  │  Gastos  │  │  Ahorro  │       │
│  │ RD$85k   │  │ RD$62k   │  │  27.3%   │       │
│  │  ↑ +4%   │  │  ↓ -8%   │  │  ✓ meta  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                  │
│  Presupuesto del mes ─────────────── 73% ████░░  │
│  ⚠ Restaurantes excedido en RD$1,240             │
│                                                  │
│  Últimos movimientos                             │
│  • Bravo            −RD$3,200   hoy              │
│  • Salario          +RD$42,500  ayer             │
└──────────────────────────────────────────────────┘
```

**Cambios concretos:**
- Mover alerta de presupuesto excedido AL dashboard, no solo en Presupuestos
- Mostrar delta % vs mes anterior en cada KPI tile (ya existe, pero hacerlo más visible)
- "Insight del día" — una sola línea de contexto: "Vas 15% más lento que el mes pasado en restaurantes"

---

### 2. Entrada de transacciones: velocidad < 10 segundos

El patrón ganador en Copilot y Monarch: **categorización predictiva que aprende**.

```
┌─────────────────────────────────┐
│  Nueva transacción              │
│                                 │
│  RD$ [   3,200   ]              │
│                                 │
│  💡 "Bravo" → Supermercado      │  ← sugerencia basada en nota
│  ┌──────┐ ┌──────┐ ┌──────┐    │
│  │ 🛒   │ │ 🍔   │ │ 🚗   │    │
│  │ Súper│ │ Rest │ │ Trans│    │
│  └──────┘ └──────┘ └──────┘    │
│                                 │
│  [Guardar gasto]                │
└─────────────────────────────────┘
```

**Cambios concretos:**
- Autocomplete de nota basado en historial (últimas 5 entradas similares)
- Pre-selección de cuenta según patrón horario/día (ej. viernes noche → Visa)
- Teclado numérico nativo en móvil (inputMode="numeric")
- Shortcut: `N` para nueva transacción desde cualquier vista
- Swipe right en transacción del listado → editar

---

### 3. Presupuestos: dials + contexto temporal, no solo barras

La barra de progreso no responde "¿voy bien?". El dial con contexto sí.

```
┌──────────────────────────────────────────┐
│  Supermercado          Día 22 de 31      │
│                                          │
│       ╔══════════╗                       │
│      ║  RD$12.4k  ║   Meta: RD$18k      │
│      ║    69%     ║   ✓ Al ritmo         │
│       ╚══════════╝   Proy: RD$17.5k     │
│                                          │
│  ████████████████░░░░░░░  69% / 71%día  │
│  Tu ritmo diario vs. % del mes          │
└──────────────────────────────────────────┘
```

**Cambios concretos:**
- Indicador "ritmo vs. tiempo transcurrido": si gastaste 69% con 71% del mes = 🟢 bien
- Proyección de fin de mes en cada categoría (ya existe global, llevar a nivel categoría)
- Estado emocional: 🟢 Al ritmo / 🟡 Cuidado / 🔴 Excedido
- Celebración cuando terminas el mes bajo presupuesto

---

### 4. Micro-interacciones que generan confianza

Cada acción financiera necesita confirmación visual. Sin esto la app se siente "hueca".

| Acción | Micro-interacción |
|--------|------------------|
| Guardar transacción | Botón → spinner (150ms) → checkmark verde + toast |
| Borrar transacción | Shake + diálogo → undo toast 3s |
| Meta cumplida | Confetti burst + toast especial |
| Presupuesto excedido | Border rojo pulsante en la tarjeta |
| Saldo negativo | Número en rojo con fade |

---

### 5. Mobile layout: bottom nav + gestos

En < 600px el sidebar no funciona. Se necesita un layout diferente.

```
┌─────────────────────┐
│  $harky    May 2026 │
│  ──────────────────  │
│                      │
│  [  Contenido  ]     │
│                      │
│  ──────────────────  │
│  🏠  💳  📊  🎯  ＋  │
│  Inicio Ctas Stats Metas Add  │
└─────────────────────┘
```

- Bottom navigation 5 ítems (Home, Cuentas, Stats, Metas, +)
- FAB central para "Agregar transacción"
- Bottom sheet para modales (no modal centrado)
- Swipe izq/der en transaction rows → categorizar / eliminar

---

### 6. Empty states: contexto + guía, no vacío

"Si tu interfaz muestra silencio, el usuario se va. Si explica, sugiere y guía, esa misma pantalla es onboarding." — Nielsen Norman Group

```
┌─────────────────────────────────┐
│                                 │
│        🦈 [logo animado]        │
│                                 │
│   Sin transacciones en mayo     │
│                                 │
│   Registra tu primer gasto      │
│   y empieza a ver tus           │
│   patrones de ahorro.           │
│                                 │
│   [+ Agregar transacción]       │
│                                 │
│   ─ o ─                         │
│   [Cargar datos de ejemplo]     │
└─────────────────────────────────┘
```

---

### 7. Color system upgrade: dark fintech profesional

Revolut: stark black + cobalt accent + wide palette de producto.
$harky: migrar de gray-blue a dark real con jerarquía.

```
Propuesta de tokens:
--bg:         #090D14   (más oscuro que #0a0e16, más premium)
--surface:    #111827   (mantener)
--surface-2:  #161E2E   (más azulado, más fintech)
--accent:     #3B82F6   (mantener, es buen azul)
--accent-alt: #6366F1   (para highlights secundarios)
--income:     #10B981   (más saturado que #2ecc8f)
--expense:    #EF4444   (más saturado que #f65574)
--warn:       #F59E0B   (nuevo: para "cuidado, 80%")
--success:    #22C55E   (nuevo: para celebraciones)
```

---

## Patterns que usan los mejores

1. **Cuenta corriente siempre visible** — no hay que navegar para saber cuánto hay
2. **Categorías aprendidas** — el app recuerda "Bravo = Supermercado"
3. **Contexto temporal en presupuestos** — "día 22 de 31" cambia la percepción del 73%
4. **Onboarding con datos demo** — ya lo tiene $harky ✅
5. **Undo en borrar** — nadie quiere confirmar X veces, pero sí quiere deshacer
6. **Insights activos, no solo reportes** — "Gastas RD$1,200 más los viernes"

---

## Anti-patterns que evitar

- **Cards dentro de cards** — visual noise, no usar más de 1 nivel de card
- **Tooltips en onboarding** — interrumpen el flujo, usar empty states mejor
- **Barra de progreso sin contexto** — "73%" no dice si vas bien o mal
- **Modo oscuro como afterthought** — si el dark mode tiene valores de contraste menores al 4.5:1, falla accesibilidad
- **Números sin delta** — mostrar siempre vs. mes anterior o vs. meta
- **Modales para acciones de 1 campo** — usar inline edit o bottom sheet

---

## Unique Angles (lo que nadie más hace bien)

### Copilot: "Budget dials" animados
En lugar de una barra, un arco circular que se llena con ease-out. Visualmente mucho más premium.

### Monarch: "Net worth timeline"
Gráfica de área que muestra el patrimonio a lo largo del tiempo (no solo el mes). Da perspectiva de crecimiento.

### Revolut: "Instant splits"
Seleccionar múltiples transacciones y dividirlas entre personas. Para $harky v2.0 con finanzas compartidas.

### Wealthsimple: Tono editorial
Copy que habla como persona, no como banco. "$harky" ya tiene personalidad con el nombre — mantenerla en los textos.

---

## Sources

- [Era vs Monarch vs Copilot vs YNAB 2026](https://era.app/articles/era-vs-monarch-vs-copilot-vs-ynab/)
- [State of Personal Finance Apps 2025 Review](https://bountisphere.com/blog/personal-finance-apps-2025-review)
- [Fintech UI Examples to Build Trust - Eleken](https://www.eleken.co/blog-posts/trusted-fintech-ui-examples)
- [Top UI/UX Trends in Fintech 2025 - Graphic Eagle](https://www.graphiceagle.com/top-ui-ux-trends-in-fintech-products-2025-design-innovations-for-better-finance-apps/)
- [6 Finance App Design Strategies 2026 - ProCreator](https://procreator.design/blog/finance-app-design-best-practices/)
- [Revolut Design System - DesignMD](https://www.designmd.co/d/revolut)
- [Empty States UX - Eleken](https://www.eleken.co/blog-posts/empty-state-ux)
- [Best UX Practices for Finance Apps 2026 - G&CO](https://www.g-co.agency/insights/the-best-ux-design-practices-for-finance-apps)
