# Cuadre — Roadmap de producto

Estado revisado: **2026-09-23**, sobre la versión **1.9.6** (versionCode
1009007). Plataforma prioritaria: Android.
Modelo de datos: **local, sin servidor**. En 1.9.6 se eliminó toda la
infraestructura cloud (cuentas, login, sync); los datos no salen del
dispositivo.

> El roadmap anterior (P0–P2, revisado el 2026-07-16) se cumplió casi por
> completo entre las versiones 1.8 y 1.9.5: integridad de movimientos, backup
> semanal, widgets, rediseño de Cuentas y Análisis, multi-divisa real,
> detección bancaria, deudas, suscripciones y el sistema visual propio. Este
> documento lo reemplaza porque el listado viejo ya no describe dónde estamos.

## 2.0 — Cuadre Compartido: el libro del hogar

**La decisión.** Todo en Cuadre asume una sola persona. En República Dominicana
el dinero de una casa es compartido, y hoy no hay forma de compartir nada. Ésta
es la única limitación *estructural* que le queda a la app: lo demás son
pantallas que faltan, no cosas que la app no pueda ser.

**La regla que lo hace factible:** el libro compartido es un libro **APARTE**,
no la fusión de dos libros personales. Tu libro sigue siendo tuyo, privado e
intacto. Lo compartido es «la casa»: sus cuentas, sus gastos, su presupuesto.

Eso resuelve la privacidad de un plumazo —nadie ve tus cafés ni tus ahorros— y,
sobre todo, reduce la sincronización de «dos libros enteros que divergieron»
(imposible) a «una lista de operaciones sobre un libro pequeño» (resuelto).

### Por qué esto NO repite el error del sync viejo

El motor cloud que se borró en 1.9.6 sincronizaba **estado**: mandaba listas y
las fusionaba campo a campo, con una pantalla de conflictos para cuando no
sabía qué hacer. Dos listas que divergieron no se reconcilian sin adivinar, y
adivinar con dinero significa duplicar un gasto o perderlo.

El nuevo motor sincroniza **operaciones**. Cada cambio es un hecho inmutable
con identidad propia, y fusionar dos libros es una **unión de conjuntos**: la
operación más aburrida que existe, y por eso la que no se equivoca. No hay
pantalla de conflictos porque no hay conflictos que resolver.

Y los saldos **nunca viajan**: se recalculan al reproducir el registro. Un
número que no se transmite no puede desincronizarse. Esto mata de raíz la clase
de fallo que nos ocupó toda la 1.9.6 —un saldo que dice una cosa y unos
movimientos que dicen otra—, porque aquí el saldo no es un dato, es el
resultado de una suma.

### Fases

**F1 — Motor de fusión.** ✅ *Hecho.* `data/sharedLedger.ts`, 25 pruebas,
incluidas 200 historias generadas al azar que tienen que converger al mismo
libro. Lógica pura: ni red, ni interfaz, ni almacenamiento.

**F2 — Persistencia y espacio.** El registro de operaciones guardado, el
`deviceId`, y un «espacio» con sus miembros. Todavía sin red: un solo teléfono
que ya escribe en el formato compartido. Aquí se puede probar todo el modelo
sin arriesgar nada.

**F3 — Emparejar.** Dos teléfonos se reconocen por QR y acuerdan un secreto
compartido. Reutiliza `data/qrTransfer.ts` (ya existe, hoy sirve para migrar de
teléfono) y `lib/backupCrypto.ts` (PBKDF2 + AES-GCM, ya probado) y el plugin
`keystore` para guardar el secreto.

**F4 — Transporte.** Intercambio por red local (los dos en el mismo WiFi, que
es el caso real de una pareja que vive junta), con **respaldo por archivo**
para cuando no lo están. El transporte es lo *reemplazable* del diseño: el
motor no sabe ni le importa cómo llegaron los hechos.

**F5 — Interfaz.** Cambiar entre «mi libro» y «la casa», ver quién apuntó qué,
e invitar. La parte visible, y deliberadamente la última: sin F1–F4 sólidas
sería una fachada bonita sobre arena.

### Riesgos, dichos en voz alta

- **Sincronizar sigue siendo lo más difícil de esta app.** P2P es más difícil
  que con servidor, no menos. La mitigación es el diseño (operaciones, no
  estado) y el orden (motor probado antes que nada visible), no el optimismo.
- **F4 es donde puede encallar.** Android restringe el descubrimiento en red
  local y hace falta trabajo en Rust/Kotlin. Por eso el respaldo por archivo no
  es un extra: es el camino que garantiza que la función existe aunque la red
  local falle.
- **Tentación a evitar:** compartir el libro personal «para no duplicar
  cuentas». Es volver al problema imposible y perder la privacidad de paso.

## Visión

Cuadre debe sentirse como una aplicación financiera Android nativa, confiable y
personal. El usuario debe poder registrar un movimiento en segundos, entender
su situación sin interpretar dashboards complejos y confiar en que ninguna
acción duplicará, perderá o modificará su dinero silenciosamente.

## Principios del producto

- **Android primero**: navegación, gestos, back, sheets, teclado, widgets y
  permisos se diseñan para teléfono real.
- **Local-first**: la app funciona completa sin internet. La nube es opcional.
- **Confianza financiera**: cada cálculo debe poder explicarse y reconstruirse.
- **Una acción, un resultado**: crear, editar, transferir, importar o restaurar
  no puede duplicar efectos.
- **Complejidad progresiva**: lo frecuente es inmediato; lo avanzado está
  disponible sin estorbar.
- **Privacidad visible**: permisos, backup, sync y seguridad deben entenderse.

---

## Lo que el diagnóstico en dispositivo dejó claro

Medido el 2026-09-21 con el teléfono conectado, no inferido:

| Hallazgo | Estado |
|---|---|
| Listener de detección | Vinculado, con binder vivo |
| Bucket de standby | 10 (activo) |
| Trabajos programados | 2 vivos (respaldo y recordatorios) |
| Crashes registrados | Ninguno |
| Memoria con la app abierta | 98 MB PSS |
| **Lista blanca de batería** | **NO está** |
| **Pasivos en pantalla** | **RD$ 0.00 teniendo una tarjeta con deuda** |
| **Orientación horizontal** | Encajonada con barras negras |

Las tres filas en negrita son las que mandan en las Fases 1 y 3.

---

## Fase 1 — Que la app funcione sola

El problema de fondo de esta app nunca fue que le falten funciones: es que las
automatizaciones se apagan solas y el usuario no se entera. Esta fase existe
para cerrar eso.

### 1.1 Pantalla de guía de batería

**Por qué ahora.** Confirmado en el teléfono: la app **no está en la lista
blanca de batería**. Eso es exactamente lo que permite a Android matar la
detección de transacciones y diferir el respaldo semanal — el fallo que tuvo el
libro meses sin registrar nada.

**Estado.** El motor `data/batteryGuide.ts` lleva dos versiones escrito y
probado (14 tests). **No tiene pantalla.** Sólo falta la interfaz.

**Alcance.** Detectar el fabricante, explicar en lenguaje llano qué hay que
tocar, y llevar al ajuste del sistema con un botón. Sin sermones: quien lo abre
ya tiene el problema.

### 1.2 Rescate de tarjetas mal capturadas

**Por qué ahora.** La pantalla de inicio dice **"Pasivos RD$ 0.00"** con una
tarjeta de crédito que sí tiene deuda. La app pedía *cuánto debes*; el banco
muestra *cuánto te queda*. 1.9.5 ya acepta las dos formas, pero **sólo cuando
el usuario vuelve a escribir el dato** — y nadie se lo está pidiendo.

**Alcance.** Una comprobación al arrancar: tarjeta de crédito **+** límite
configurado **+** saldo positivo ≈ alguien metió el disponible donde va la
deuda. Un aviso de una sola vez: *"¿Son RD$ X lo que debes o lo que te
queda?"*, con un toque para corregirlo y otro para descartarlo si de verdad
tiene saldo a favor.

**Cuidado.** Un saldo a favor es legítimo. Esto **pregunta**, no corrige solo.

### 1.3 Verificar la alerta de detección en uso real

1.9.5 avisa en la campanita si la detección lleva 10 días sin capturar nada.
Eso todavía no se ha visto dispararse con datos reales. Revisar en unas
semanas que el umbral no sea ni ruidoso ni mudo.

**Criterio de salida de la Fase 1.** La app en la lista blanca, el patrimonio
neto reflejando la deuda real de las tarjetas, y la campanita avisando si la
detección se cae.

---

## Fase 2 — Monetización

### 2.1 VIP a producción

Todo el camino está construido: plugin nativo de Play Billing 8.3.0,
reconocimiento de compra, restauración, pagos pendientes y la pantalla. El
producto `cuadre_vip_lifetime` ya existe en Play Console.

**Lo que falta, en orden:**

1. Subir 1.9.5 a **pruebas internas**.
2. Confirmar que Play detecta el permiso de facturación.
3. Probar la compra con una **cuenta de tester de licencia** — no funciona en
   debug ni instalado por USB, tiene que venir de Play.
4. Probar el camino de **restaurar** reinstalando.
5. Quitar el candado del modo desarrollador.

### 2.2 Una función VIP que se vea

Hoy VIP vende *apoyar* y *lo que venga*. La gente paga por algo concreto.

**Pendiente de decidir.** La apuesta anterior era respaldo en la nube sobre
Supabase, pero en 1.9.6 se eliminó toda esa infraestructura a propósito: la app
es local y no queremos volver a depender de un backend ajeno.

El miedo que resolvía (perder todo) sigue siendo real y sigue siendo la mejor
palanca para justificar los US$ 4.99. Alternativas sin servidor propio que
valen la pena estudiar: respaldo a la cuenta de Google Drive **del propio
usuario** vía SAF, exportación cifrada programada, o traspaso directo entre
dos teléfonos. Ninguna nos obliga a alojar datos de nadie.

**Criterio de salida de la Fase 2.** Una compra real completada y restaurada en
un teléfono distinto.

---

## Fase 3 — Lo que Play marcó, y rendimiento

### 3.1 Los dos `BitmapFactory` sin reducción de muestreo

- **`MlkitOcrPlugin.kt:41`** — `decodeByteArray` de una foto de recibo sin
  límites. **Una foto de 12 MP son ~48 MB de bitmap.** No es un aviso de
  rendimiento: es riesgo real de cierre por memoria en teléfonos modestos.
  **La más importante de las cuatro que reportó Play.**
- **`LocalRemindersPlugin.kt:334`** — carga el ícono de lanzador a resolución
  completa para un hueco de 64dp.

El patrón correcto (`inJustDecodeBounds` + `inSampleSize`) **ya existe en el
repo**, en los otros usos. Es copiarlo.

### 3.2 Orientación horizontal

El manifiesto no fija orientación (a propósito: desde Android 16 la restricción
se ignora), pero el diseño es sólo vertical. Al girar, la app queda en una
columna estrecha con barras negras. Hay que decidir: **o el diseño respira en
horizontal, o se asume vertical y se hace a propósito.** Hoy es lo peor de las
dos.

### 3.3 `shrinkResources`

Una línea, pero **rompería la app si se mete tal cual**: hay dos sitios que
buscan drawables por nombre en tiempo de ejecución
(`resources.getIdentifier(...)` en `LocalRemindersPlugin` y `ReminderWorker`).
R8 no ve esas referencias y borraría esos íconos. Requiere un `keep.xml` y
probarlo en el teléfono — es el tipo de fallo que sólo aparece en release.

### 3.4 Tamaño del paquete

2,28 MB de precache en el service worker. `vendor-excel` (940 kB) y
`vendor-charts` (477 kB) mandan. Cargarlos bajo demanda es la vía.

---

## Fase 4 — Saber qué pasa

Hoy, si a un usuario se le rompe algo, **no nos enteramos nunca**.

### 4.1 Reporte de errores

`ErrorBoundary` existe pero no reporta. Hace falta un canal con consentimiento
explícito y **sin backend propio**: lo más barato es que el botón "Reportar"
componga un correo con la traza ya dentro, igual que hace ahora el formulario
de comentarios.

### 4.2 Medir la cobertura del parser bancario

El simulador del panel de desarrollador ya está hecho. Con avisos reales de
Banreservas, Popular y BHD se puede medir **qué porcentaje se reconoce** y
subirlo con datos en vez de a ojo.

### 4.3 Telemetría mínima, opcional

Sólo lo que sirve para decidir: qué pantallas se usan, si la detección captura,
si el respaldo corre. Nunca montos ni conceptos.

---

## Fase 5 — Deuda técnica restante

La cadena de herramientas ya se estabilizó en 1.9.5 (Kotlin 2.2.20, Play
Billing 8.3.0, CI ampliada a todas las ramas con e2e y compilación del Kotlin
de los plugins). Queda:

- **`jvmTarget` de 1.8 a 17.** Silencia los avisos de `source value 8 is
  obsolete`. Una tarde, con su build de verificación.
- **AGP 9.0.** Lo pide Play para la optimización de R8. Obliga a subir Kotlin y
  Gradle otra vez, con cambios incompatibles. **No antes de que la cadena lleve
  un tiempo estable.**
- **Cobertura e2e.** 12 pruebas para una app de este tamaño es poco. La guardia
  de desbordamiento ya demostró su valor; falta cubrir crear movimiento,
  editar cuenta y pagar tarjeta.
- **Verificar la alerta de la fecha del versionCode.** La puerta del changelog
  ya está probada aislada; falta verla abortar en una build real.

---

## Fase 6 — Producto, más adelante

- **Accesibilidad.** Contraste y tamaños táctiles sin auditar. El test de
  desbordamiento cubre una parte, no todo.
- **Más idiomas.** Hoy es/en con paridad completa (1.677 claves). Con el
  mercado en RD no urge.
- **Widgets.** Están construidos pero nunca se han visto funcionar en uso real.
- **Reconciliación bancaria por CSV.** Existe; falta medir si alguien la usa.

---

## Orden recomendado

**1.9.6** — Fase 1 completa (batería + rescate de tarjetas). Las dos atacan el
mismo problema y las dos están medio hechas.

**1.9.7** — Fase 3.1 y 3.2 (los `BitmapFactory` y la orientación), que son los
arreglos que Play ya está marcando.

**1.10** — Fase 2 completa: VIP en producción con el respaldo en la nube como
lo que se vende.

Fases 4 y 5 se reparten entre medio: no justifican una versión propia, pero
cada una que entre reduce el tiempo que cuesta diagnosticar la siguiente.
