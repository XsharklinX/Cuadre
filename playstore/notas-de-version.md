# Notas de versión — Cuadre

Las notas que van en Play Console, en «Novedades de esta versión», una por idioma.

**Límite de Play: 500 caracteres por idioma.** Pasarse hace que Console rechace
el texto al pegarlo, así que cada bloque de aquí está contado y cabe. Si hay que
recortar, se quitan líneas enteras de abajo hacia arriba: están ordenadas de lo
que más se nota a lo que menos.

Se escriben **para quien usa la app**, no para el repositorio: lo que cambia en
su teléfono, no cómo se hizo. El detalle técnico vive en `src/data/release.ts`,
que es lo que la app enseña en «Novedades» dentro, y en el ROADMAP.

---

## 2.1.0 · versionCode pendiente

### Español (ES)

```
Esta vez le tocó a Negocio.

COBROS
Abre con lo que hay que cobrar HOY y con el nombre de quien peor está. La lista va agrupada, y lo cobrado a su historial.

CADA CLIENTE, SU FICHA
Lo que te ha pagado, su puntualidad y lo que le queda. Con su comprobante de pago en PDF y su estado de cuenta del año.

TUS NÚMEROS, APARTE
Informes con filtro de Negocio o Personal, y la ganancia con su margen.

Y además: varios servicios por cliente, cobros sueltos y apartar un % de cada cobro de verdad.
```

### English (EN)

```
This one is all about Business.

PAYMENTS
It opens on what to collect TODAY and names who is worst. The list is grouped, and what you collected moves to its history.

EVERY CLIENT, THEIR CARD
What they have paid you and what is left, with their payment receipt as a PDF and their yearly statement.

YOUR NUMBERS, APART
Reports with a Business or Personal filter, and profit with its margin.

Plus: several services per client, one-off charges, and setting aside a % of every payment for real.
```

### Para la ficha de Seguridad de datos

Sin cambios respecto a la 2.0.0: los papeles que genera esta versión
—comprobantes, estados de cuenta, exportaciones— se crean en el dispositivo y
los guarda el usuario donde quiera. Nada sale de él por su cuenta.

---
## 2.0.0 · versionCode 1009018

### Español (ES)

```
Cuadre 2.0 trae tres cosas grandes.

COBROS Y CLIENTES
Registra a quién le cobras, cada cuánto y en qué cuenta deposita. Te avisa de quién se atrasó y anota el pago de un toque.

NEGOCIOS CON GANANCIA REAL
Lo cobrado menos lo que te cuesta, al mes y al año. Una suscripción anual cuenta su parte cada mes, no de golpe.

CUADRAR CON TU BANCO
Escribe lo que dice tu banco y la app anota la diferencia sin tocar tu saldo.

Y además: el bote de los caprichos.
```

### English (EN)

```
Cuadre 2.0 brings three big things.

PAYMENTS AND CLIENTS
Add who pays you, how often and which account they use. It flags who is late and logs the payment in one tap.

BUSINESSES WITH REAL PROFIT
Collected minus what it costs you, monthly and yearly. A yearly subscription counts its share each month.

MATCH YOUR BANK
Enter what your bank says and the app logs the gap without touching your balance.

Plus: the splurge jar and a 30-day trash.
```

### Para la ficha de Seguridad de datos

Sin cambios respecto a la 1.9.12: los datos nuevos de esta versión (clientes,
cobros, negocios) viven en el dispositivo igual que el resto y no salen de él.
Sigue habiendo imágenes almacenadas (las fotos de recibo).

---
## 1.9.12 · versionCode 1009017

### Español (ES)

```
Esta versión hace que la app responda cuando la tocas.

• Todo lo que pulsas devuelve un toque; ingresos y gastos suenan distinto
• Tu racha de días anotando, sin regaños si se rompe
• Las metas celebran la mitad y los tres cuartos, no solo el final
• Papelera de 30 días para recuperar lo borrado
• La foto del recibo se guarda con el movimiento
• Si guardar falla, queda apuntado y se puede reintentar
• Avisa si el detector se calla o llevas sin copia
```

### English (EN)

```
This release makes the app respond when you touch it.

• Everything you tap nudges back; income and expenses sound different
• Your logging streak, with no scolding if it breaks
• Goals celebrate the halfway and three-quarter marks, not just the end
• 30-day trash to recover what you delete
• The receipt photo is kept with the movement
• If saving fails, it's recorded and can be retried
• Warns you if detection goes quiet or a backup is overdue
```

### Para la ficha de Seguridad de datos

Esta versión es la primera que **guarda imágenes** (las fotos de recibo). Viven
en el dispositivo, en IndexedDB, y no salen de él. Si el formulario pregunta por
fotos, la respuesta es que sí se almacenan y que no se comparten ni se envían a
ningún sitio.
