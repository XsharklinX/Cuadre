# Notas de version — Cuadre

Las notas que van en Play Console, en «Novedades de esta version», una por
idioma.

## Como se escriben

**Limite de Play: 500 caracteres por idioma.** Pasarse hace que Console
rechace el texto al pegarlo, asi que cada bloque de aqui esta contado y cabe.

Se escriben **para quien usa la app**: lo que cambia en su telefono, no lo que
hicimos nosotros. El detalle tecnico vive en `src/data/release.ts`, que es lo
que la app ensena en «Novedades» dentro, y en el ROADMAP.

Y se escriben con estas reglas, que estan aqui porque se incumplieron tres
versiones seguidas:

1. **Nada en mayusculas.** Ni titulares ni palabras sueltas. Un «MAS LIMPIO»
   grita, y las apps que se respetan no gritan en su ficha.
2. **Nada de «Y ademas:».** Es un cajon de sastre: si algo importa tiene su
   linea, y si no, se queda fuera. Lo mismo con «Plus:» en ingles.
3. **Frases normales, en minuscula, declarativas.** «Tus servicios salen con
   el logo de su marca», no «NUEVO: LOGOS DE MARCA».
4. **Se abre con lo que el usuario nota al abrir la app**, no con lo que mas
   trabajo costo. Son cosas distintas y casi nunca coinciden.
5. **El esqueleto cambia de version a version.** Si la anterior fueron tres
   bloques con titulo, esta no. Dos versiones con la misma forma ya es una
   plantilla, y se ve.
6. **Nada de lo de dentro.** Rendimiento, almacenes, refactores: si el usuario
   no lo puede sentir, no va aqui.
7. **Se cuentan los caracteres ANTES de escribir el archivo**, y se comprueba
   que no se haya caido ninguna de las ideas principales al recortar. El
   recortador se llevo «MATCH YOUR BANK» en silencio una vez.

Si hay que recortar, se quitan ideas enteras —la menos visible primero— en
vez de dejar frases a medias.

---
## 2.4.0 · versionCode 2003001

### Español (ES) · 472 caracteres

```
Negocio ahora tiene tres pestañas: Clientes, Cobros y Ganancia.

Clientes: búscalos, fíltralos y elige varios para cambiarles el precio de una vez. Cada uno tiene su historia de pagos.
Estrellas: quien te trae a otro cliente paga menos, y la estrella se pone sola.
Servicios: se pagan solos el día que toca, o te avisan. Une los repetidos en uno.
Ganancia: ahora sale de lo que cobras y pagas, y muestra los próximos meses.

Los avisos del teléfono vuelven a actualizarse.
```

### English (EN) · 448 characters

```
Business now has three tabs: Clients, Payments and Profit.

Clients: search, filter and select several to change their price at once. Each one has a payment history.
Stars: whoever brings you another client pays less, and the star is added automatically.
Services: they pay themselves on the due day, or remind you. Merge duplicates into one.
Profit: now based on what you collect and pay, with the coming months.

Phone notifications update again.
```

### Para la ficha de Seguridad de datos

Sin cambios respecto a la 2.3.0. Estrellas, pagos automáticos y plantillas viven en el dispositivo y no salen de él.

---
## 2.3.0 · versionCode 2002001

### Español (ES) · 497 caracteres

```
La ganancia de tus negocios ya cuadra: «Has puesto» suma solo lo que pagaste por sus servicios, y puedes verla en pesos o en dólares.

- Los clientes salen bajo su servicio y cada uno dice si está al día o debe.
- Un servicio admite varias cuentas y te dice cuánto cuesta cada plaza y cuándo toca pagar.
- El + en Negocio crea clientes, cobros o servicios.
- Análisis abre con lo que entró, salió y queda, y compara dos meses cualesquiera.

Al tocar un formulario ya no se mueve lo que hay detrás.
```

### English (EN) · 489 characters

```
Your business profit now adds up: "You've put in" counts only what you paid for its services, and you can view it in pesos or dollars.

- Clients sit under their service, each showing if they're paid up or owe.
- A service can have several accounts and shows the cost per slot and when to pay.
- The + in Business creates clients, charges or services.
- Analytics opens with what came in, went out and is left, and compares any two months.

Tapping a form no longer moves what's behind it.
```

### Para la ficha de Seguridad de datos

Sin cambios respecto a la 2.2.0. Nada nuevo sale del dispositivo.

---
## 2.2.0 · versionCode 2001001

### Español (ES)

```
Negocio y Caprichos cambian bastante en esta versión.

Tus servicios salen con el logo de su marca y cada negocio con su color. Puedes mover un servicio a otro negocio, ordenar la lista y archivar lo que ya no llevas.

Si tienes dos fichas de la misma persona, la app te lo dice y te ofrece unirlas sin perder nada.

Caprichos estrena Antojos: apunta lo que quieres antes de comprarlo y espera siete días. Si se te pasan las ganas, no lo compraste.

La barra de arriba tiene tres botones menos.
```

### English (EN)

```
Business and Splurges change a lot in this release.

Your services show their brand logo and each business its own colour. You can move a service to another business, reorder the list and archive what you no longer run.

If you have two cards for the same person, the app tells you and offers to merge them without losing anything.

Splurges now has Wishes: write down what you want before buying it and wait seven days. If the urge passes, you didn't buy it.

The top bar has three buttons fewer.
```

### Para la ficha de Seguridad de datos

Sin cambios respecto a la 2.1.0. Los antojos y los duplicados viven en el
dispositivo igual que el resto y no salen de el.

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
