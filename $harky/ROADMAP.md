# $harky - Roadmap maestro de producto

Estado revisado: 2026-07-16
Plataforma prioritaria: Android
Modelo de datos: local-first con sincronizacion cloud opcional

## Vision

$harky debe sentirse como una aplicacion financiera Android nativa, confiable y
personal. El usuario debe poder registrar un movimiento en segundos, entender
su situacion sin interpretar dashboards complejos y confiar en que ninguna
accion duplicara, perdera o modificara su dinero silenciosamente.

La aplicacion ya tiene una base funcional amplia. El siguiente salto profesional
requiere menos acumulacion de funciones y mas coherencia entre datos, pantallas,
interacciones, automatizaciones y distribucion.

## Principios del producto

- Android primero: navegacion, gestos, back, sheets, teclado, widgets y permisos
  deben diseñarse para telefono real.
- Local-first: la app debe funcionar completa sin internet. La nube es opcional.
- Confianza financiera: cada calculo debe poder explicarse y reconstruirse.
- Una accion, un resultado: crear, editar, transferir, importar o restaurar no
  puede duplicar efectos.
- Complejidad progresiva: lo frecuente debe ser inmediato; lo avanzado debe
  estar disponible sin estorbar.
- Coherencia visual: una sola familia de componentes, iconos, animaciones,
  espacios, estados y patrones de navegacion.
- Privacidad visible: permisos, backup, sync y seguridad deben ser entendibles.
- Calidad verificable: una fase no se considera terminada solo porque la UI
  existe; debe pasar pruebas de comportamiento y uso en dispositivo.

---

## P0 - Estabilidad y confianza

Objetivo: eliminar problemas que puedan bloquear la app, perder datos, congelar
el touch, duplicar dinero o producir releases imposibles de verificar.

### Integridad de movimientos

- ~~Auditar crear, editar, eliminar, deshacer e importar gastos e ingresos.~~
  Ya cubierto por trabajo previo de esta auditoria: `assertTransactionShape`
  impide payloads hibridos, `normalizeTransaction` descarta campos ajenos al
  tipo, y hay tests de propiedades del libro (conservar dinero, reversibilidad).
- ~~Garantizar que una transferencia nunca pueda convertirse accidentalmente en
  gasto o ingreso.~~ Ya lo hacia el store (`updateTx` rechaza el cambio de
  tipo en ambas direcciones); confirmado con test.
- ~~Verificar transferencias entre cuentas visibles, ocultas y multi-moneda.~~
  Cubierto con tests en sesiones previas de esta auditoria.
- ~~Hacer todas las operaciones idempotentes ante doble toque, reintento o lag.~~
  ~~Bloquear guardados repetidos mientras una operacion esta en curso.~~
  Ninguna pantalla que mueve dinero (crear movimiento, transferencia, aportar
  a meta, conciliar cuenta) bloqueaba su boton mientras guardaba — un doble
  toque en un telefono lento podia duplicar la transaccion. Se agrego
  `useSubmitGuard` (hook compartido) y se aplico en los 4 puntos reales de
  mutacion: `TransactionForm`, `MobileCreateFlow`, `MobileGoals` (aportar) y
  `MobileAccounts` (conciliar). Probado con tests que simulan el doble tap.
- Detectar duplicados por identificador, fecha, monto, cuenta, nota y origen.
  *(parcial: `isDuplicateTransaction` ya comparaba fecha+monto+nota; se le
  agrego comparacion de cuenta —antes dos cuentas distintas con el mismo
  monto/nota/fecha se marcaban duplicado por error— y ahora tambien corre en
  `TransactionForm`, que no tenia ningun aviso. Falta "origen" (manual vs.
  notificacion bancaria vs. CSV) — hoy no se etiqueta el origen de una
  transaccion en absoluto, requeriria un campo nuevo.)*
- Crear un historial tecnico de operaciones para diagnosticar duplicaciones sin
  guardar informacion sensible. *(no abordado: es una feature de diagnostico
  aparte —un log de operaciones, no de datos—, no algo para sumar de paso a
  esto)*
- Reconciliar saldos automaticamente despues de restore, sync e importacion.
  *(restore ya reconcilia automaticamente, verificado en sesiones previas;
  sync e importacion CSV no confirmados)*

### Interacciones bloqueadas

- Consolidar el bloqueo de scroll de todos los sheets y overlays.
- Revisar que eliminar, guardar o cerrar un modal siempre libere el touch.
- Mantener un unico contenedor de scroll por pantalla.
- Evitar `touch-action: none`, overlays invisibles y backdrops que capturen
  gestos despues de desmontarse.
- Probar scroll desde cualquier punto de Movimientos, Analisis, Informes,
  Perfil, formularios, pad numerico y Configuracion.
- Hacer que back Android cierre primero teclado, sheet, detalle o subpantalla
  antes de intentar salir de la aplicacion.

### Plugins nativos en el repo

- ~~Mover los 5 plugins nativos (mlkit-ocr, local-reminders, bank-notifications,
  keystore, home-widget) a `plugins/` dentro del repo.~~ Antes vivian como
  carpetas sueltas en `E:\Programacion\` referenciadas con `../../`, fuera del
  control de versiones del proyecto: clonar el repo NO daba una copia
  compilable. Ahora son 5 carpetas en `plugins/`, referenciadas con
  `../plugins/X` desde `src-tauri/Cargo.toml`. Verificado: `cargo check`
  compila los 5 desde la nueva ruta y `tauri.settings.gradle` se regenera solo
  apuntando ahi. `.gitignore` versiona solo la fuente (97 archivos, 0
  artefactos): `target/`, `build/`, `.gradle/` y el glue generado `.tauri/`
  quedan fuera.
- Borrar las carpetas viejas en `E:\Programacion\sharky-*-plugin`. **Pendiente
  a proposito**: la copia esta verificada archivo por archivo, pero borrar algo
  que no cree yo es del usuario, no mio.
- ~~Efecto colateral del movimiento: el build de Gradle se rompio.~~ La carpeta
  del proyecto se llama `$harky`, con un dolar literal. `tauri-build`
  (`src/mobile.rs`) genera `tauri.settings.gradle` escribiendo las rutas de los
  plugins con el formato Debug de Rust (`{:?}`), que produce comillas DOBLES.
  Rust no escapa el `$` porque ahi no significa nada, pero en Groovy comillas
  dobles = GString y `$harky` se interpola como variable:
  `Could not get unknown property 'harky' for settings 'android'`.
  Mientras los plugins vivian en carpetas hermanas (`sharky-*-plugin`) sus rutas
  no contenian `$` y el bug de tauri-build no se notaba; meterlos en `plugins/`
  lo destapo.
  Arreglado en `gen/android/settings.gradle` (que NO es autogenerado) declarando
  `ext.harky = '$harky'` antes del apply: la interpolacion devuelve el texto
  original. No se puede arreglar en `tauri.settings.gradle` — se regenera en
  cada compilacion de Rust.

### Backup semanal local

- ~~Convertir el backup semanal en una tarea Android real con WorkManager o
  AlarmManager. Actualmente depende de abrir la app en el dia y hora elegidos.~~
  `BackupWorker` (WorkManager) corre cada 6h y comprueba la ventana dia/hora
  configurada — ya no hace falta abrir la app. `useWeeklyAutoBackup` (el camino
  viejo, al abrir) queda SOLO para desktop/PWA, donde no hay WorkManager; si no,
  ambos escribirian el mismo backup dos veces.
- ~~Permitir seleccionar una carpeta mediante Storage Access Framework y conservar
  el permiso sobre esa ubicacion.~~ `pickBackupFolder` abre
  `ACTION_OPEN_DOCUMENT_TREE` y llama `takePersistableUriPermission`; sin eso el
  permiso se perdia al reiniciar y el backup de fondo habria fallado en silencio.
- ~~Eliminar rutas publicas codificadas que fallen con scoped storage.~~ En
  Android el destino ya no es `/storage/emulated/0/Download` codificado, sino el
  tree URI que eligio el usuario. (El `saveToAppFolder` de Rust sigue igual para
  desktop, donde no hay scoped storage.)
- ~~Mostrar destino, proxima ejecucion, ultimo intento, ultimo exito y error.~~
  `getBackupStatus` reporta el estado REAL (incluye re-comprobar que la carpeta
  siga siendo escribible, porque el usuario puede borrarla o revocar el permiso)
  y se muestra en Ajustes > backup semanal.
- ~~Añadir un boton "Probar backup ahora" que escriba, lea y valide el archivo.~~
  `runBackupNow` ejecuta el MISMO `BackupWorker.runBackup` que el worker
  semanal, y valida releyendo el archivo escrito (probar un camino distinto del
  que corre de verdad no prueba nada).
- Permitir definir dia, hora, retencion y avisos de exito o fallo. *(dia y hora
  ya; retencion y avisos no — el backup semanal sobrescribe un archivo fijo, asi
  que "retencion" implica decidir un esquema de rotacion antes)*
- Diferenciar backup semanal, exportacion manual y puntos de recuperacion.
- Probar restauracion usando exactamente el archivo automatico generado.
  **Requiere dispositivo**: el codigo esta, pero el flujo SAF + WorkManager solo
  se puede validar de verdad en un telefono.

### Configuracion funcional

- ~~Evitar que Configuracion abra automaticamente Tema, Exportar u otro sheet.~~
- ~~Corregir estados residuales al cerrar y volver a abrir la pantalla.~~
  Ambos tenian la misma causa: `MobileSettings` abria el sheet inicial desde un
  `useEffect` reactivo sobre el prop `initialSheet`. Eso (a) podia re-disparar en
  un re-render y (b) no re-disparaba si el valor no cambiaba entre dos aperturas
  al mismo destino, dejando estado residual porque solo se limpiaba al cerrar
  Configuracion entera. Ahora el valor se consume UNA vez, como estado inicial
  del montaje: sin efecto reactivo no hay auto-apertura ni prop obsoleto.
- Garantizar que todas las opciones indiquen su valor y resultado real.
- Mostrar claramente cuando una funcion no esta soportada o necesita permiso.
- Añadir diagnostico de biometria, notificaciones, acceso bancario, carpeta de
  backup, widgets, camara y almacenamiento. *(hecho: carpeta de backup y
  widgets. Faltan biometria, notificaciones, acceso bancario, camara y
  almacenamiento)*
- Incorporar acciones para reparar permisos o abrir el ajuste Android correcto.

### Widgets funcionales

- ~~Detectar soporte, widgets instalados y fecha de ultima actualizacion.~~
  `getDiagnostics` pregunta a Android cuantos widgets hay puestos de cada tipo
  (`AppWidgetManager.getAppWidgetIds`) y cuando se sincronizo el snapshot por
  ultima vez. Antes la app no tenia forma de saberlo.
- ~~Confirmar si Android acepto realmente la solicitud de añadir el widget.~~
  Android no avisa si el usuario acepto el dialogo, asi que tras pedirlo se
  re-consulta el conteo real en vez de asumir que se añadio. Cada tarjeta marca
  con un check los que ya estan puestos.
- ~~Añadir "Actualizar ahora" y diagnostico del snapshot enviado.~~
- ~~Verificar rutas, botones de gasto/ingreso, datos vacios y datos antiguos.~~
  **Bug raiz encontrado**: NINGUN deep link funcionaba en Android. El widget "+"
  abria la app pero se quedaba en Inicio. Causa: `tauri.conf.json` solo declaraba
  `deep-link.desktop`; el plugin (`DeepLinkPlugin.kt`) hace
  `if (config.mobile.isEmpty()) return false` en `isDeepLink()`, o sea que
  descartaba TODOS los deep links en Android. El intent-filter manual del
  manifest si lanzaba la app — por eso abria — pero el plugin nunca emitia el
  evento, asi que `getCurrent()`/`onOpenUrl` no devolvian nada.
  Esto afectaba por igual a los 4 widgets Y a los atajos de mantener presionado
  el icono. El login con Google sobrevivia de casualidad: `auth.ts` tiene una
  "red de seguridad" que revalida la sesion con Supabase al recuperar el foco
  (su comentario dice "algunos dispositivos no entregan el deep link por
  onOpenUrl" — no eran los dispositivos, era esta config).
  Arreglado añadiendo `deep-link.mobile` con los hosts `shortcut` y `auth`.
- ~~Redisenar visualmente los 4 widgets (Balance, Presupuestos, Conversor,
  Acceso rapido).~~ El problema no era solo estetico: el Balance declaraba 2x2
  pero metia 45 elementos y 3 niveles de tarjeta anidada (fondo con borde >
  tarjeta con borde > chip con borde). Ese contenido pide ~4x4 reales, y por eso
  se comia media pantalla.
  - **Balance**: 2x2 con una sola idea (saldo + variacion vs cierre del mes
    pasado). Al ensancharlo pasa solo a 4x2 con cuentas y accesos — crece a lo
    ANCHO, no a lo alto. `maxResizeHeight` impide estirarlo en vertical, que
    solo dejaria hueco.
  - **Presupuestos**: 3 filas en vez de 4, sin la linea "RD$ 400 / RD$ 250" (el
    % ya lo dice). El color de la barra ahora significa estado — antes un
    presupuesto al 160% se pintaba del mismo amarillo que uno al 32%.
  - **Conversor**: de 3x3 a 2x2. Eran tres cifras; pedia 3x3 porque cada una
    vivia en su tarjeta con bandera y borde.
  - **Acceso rapido**: el "+" ahora dice "Gasto" — antes no habia forma de saber
    si agregaba gasto o ingreso.
  - Superficie unica plana (`widget_surface`) en vez de gradiente de 3 paradas +
    bordes anidados. Se borraron 7 drawables del diseno viejo que quedaron sin
    uso.
  - **Bug post-instalacion 1 (widget negro con boton "Fix")**: el layout del
    Balance usaba `<Space>` y `<View>` como acento/espaciador. RemoteViews solo
    admite vistas anotadas con `@RemoteView` (confirmado en las fuentes de
    Android: el filtro es `clazz.isAnnotationPresent(RemoteView.class)`), y ni
    `Space` ni `View` lo estan — el widget reventaba al inflarse. Cambiados por
    `ImageView` (acento) y `FrameLayout` vacio (espaciador), ambos permitidos.
    Verificado compilando el plugin.
  - **Bug post-instalacion 2 (el "+" abria la app pero se quedaba en Inicio)**:
    aun con `deep-link.mobile` bien configurado, el plugin no entrega el evento
    de deep link de forma fiable en warm-start (el mismo problema que `auth.ts`
    ya documentaba y esquivaba). Se agrego una red de seguridad con el patron
    probado de "compartir recibo": `MainActivity.handleShortcutIntent` escribe
    el atajo en `{cacheDir}/shortcut.txt`, el comando Rust `take_pending_shortcut`
    lo consume, y `useAppShortcut` lo consulta al montar y al recuperar el foco.
    Ahora hay dos caminos (deep link + marcador), no uno fragil.
- Probar Balance, Presupuestos, Conversor y Acceso rapido en telefono real.
  **Requiere dispositivo.**
- Retirar o fusionar widgets que no aporten valor suficiente. *(descartado: se
  mantienen los 4)*
- ~~Quitar de Ajustes la seccion completa de Widgets (previews + grilla de
  añadir + diagnostico + cuentas del widget).~~ Ocupaba mucho y no aportaba
  mas que decoracion; los widgets se siguen añadiendo desde la pantalla de
  inicio (mantener presionado). Los widgets en si siguen funcionando.

## Redondeo de montos (quitar centavos)

- ~~Boton "Redondear montos" en Ajustes > Datos.~~ Motivado por un caso real:
  tocar el conversor de moneda y volver dejaba centavos (100 → 99.98).
  `roundFinanceAmounts` redondea al entero mas cercano cada monto (movimientos,
  splits, `toAmount`, apertura de cuentas/metas, limites, presupuestos) y
  RECONSTRUYE saldos/ahorros con las funciones de reconciliacion — asi el
  resultado es entero Y se mantiene la invariante `saldo = apertura +
  movimientos`, en vez de redondear cada saldo por separado. Reversible: crea un
  punto de recuperacion (`pre-round`) antes. Confirmacion con advertencia previa.
  7 tests nuevos + verificado de punta a punta en navegador (100 → 100, splits
  re-cuadrados, invariante intacta).
- ~~Bug de z-index encontrado al verificar: el dialogo de confirmacion
  (`useDialogs`, z-index 200) quedaba DETRAS de la pantalla de Ajustes
  (z-index 220) — tocabas la accion y no se veia nada.~~ Subido `.modal-overlay`
  a z-index 500 (sobre todos los sheets, bajo los toasts). Afectaba a CUALQUIER
  confirm/prompt abierto desde Ajustes, no solo al redondeo.

### Release Android

- Mantener versionName, versionCode, package, notas y checklist sincronizados.
- No incrementar versiones si el build falla.
- Validar APK/AAB, firma, iconos, manifest, deep links y widgets antes de publicar.
- Automatizar smoke tests del paquete instalado, no solo del navegador.
- Mantener un canal interno de Play Store antes del canal estable.
- Documentar rollback cuando una version no abra o corrompa una preferencia.

### Criterio de salida P0

- Ninguna operacion duplica o altera dinero dos veces.
- Borrar o cerrar ventanas no bloquea scroll ni touch.
- El backup semanal se ejecuta y restaura en un telefono real.
- Configuracion abre siempre en su raiz y cada opcion responde.
- Los widgets instalados muestran datos y abren la ruta correcta.
- El paquete publicado pasa un checklist reproducible.

---

## P1 - Rediseño de experiencia Android

Objetivo: convertir el conjunto de pantallas en una experiencia coherente,
rapida y reconocible como una aplicacion movil profesional.

### Arquitectura de navegacion

- Definir cinco destinos principales estables:
  - Movimientos
  - Analisis
  - Agregar
  - Informes
  - Perfil
- Mantener Presupuestos, Calendario, Suscripciones, Deudas y otras herramientas
  como rutas secundarias con una navegacion clara.
- Rediseñar el menu de herramientas para que sea compacto, contextual y distinto
  de Perfil o Configuracion.
- Mantener estado y posicion de scroll al cambiar de pestaña.
- Añadir transiciones laterales para subpantallas y verticales para sheets.
- Evitar saltos bruscos entre Informes, Cuentas y Metas.
- Definir deep links internos para cada herramienta y accion importante.

### Sistema visual

- Crear tokens definitivos para color, tipografia, espaciado, radio, elevacion,
  bordes, opacidad, duracion y easing.
- Reducir tarjetas flotantes, sombras y radios excesivos.
- Usar superficies de pantalla completas y separadores sutiles donde sea posible.
- Unificar iconos, grosor, tamaño y alineacion.
- Establecer tamaños tactiles minimos de 44-48 dp.
- Crear estados pressed, disabled, loading, success, warning y destructive.
- Mantener animaciones entre 160 y 220 ms, con excepciones justificadas.
- Garantizar que oscuro, claro, AMOLED y sistema tengan contraste correcto.
- Diseñar para edge-to-edge, barras del sistema y safe areas.

### Movimientos

- Mantener el resumen mensual fijo y mas compacto.
- Mostrar ingresos, gastos y balance con igual jerarquia y formato de moneda.
- Hacer que tocar Balance abra el desglose por cuenta.
- Simplificar filtros como chips horizontales y conservar el filtro elegido.
- Convertir la busqueda en overlay movil con resultados instantaneos.
- Agrupar movimientos por dia con total diario claro.
- Mantener icono, nota, categoria, cuenta y monto legibles sin ruido.
- Hacer swipe estable, exclusivo por fila y cerrado automaticamente.
- Abrir detalle opaco, claro y con acciones bien separadas.
- Crear editor dedicado para transferencias.
- Añadir seleccion multiple solo como modo explicito, no con checkboxes permanentes.
- Incorporar filtros guardados utiles: cuenta, categoria, monto, fecha y tags.

### Flujo Agregar

- Mantener gasto, ingreso y transferencia en un segmented control claro.
- Integrar cuenta seleccionada dentro del pad numerico.
- Hacer categorias grandes, tactiles y ordenadas por uso reciente.
- Incluir boton para crear categoria de gasto o ingreso sin abandonar el flujo.
- Permitir monto, nota, fecha, cuenta y categoria sin formularios largos.
- Mostrar acciones avanzadas de forma progresiva: recurrencia, tags, recibo y splits.
- Evitar que teclado, pad, FAB o bottom nav se superpongan.
- Añadir confirmacion inmediata, haptic y opcion de deshacer.
- Recordar elecciones razonables sin cambiar datos silenciosamente.
- Ofrecer modo calculadora sin convertir la pantalla en una calculadora compleja.

### Inicio y contexto financiero

- Decidir si Movimientos es la pantalla inicial definitiva.
- Si se conserva un Home separado, debe ser configurable y accionable.
- Priorizar alertas, presupuesto restante, proximo pago y ultimos movimientos.
- Evitar una pantalla compuesta solo por tarjetas informativas genericas.
- Permitir ocultar, ordenar o reducir modulos del resumen.
- Mostrar una sola recomendacion importante, no una lista de mensajes.

### Informes, Cuentas y Metas

- Refinar el selector interno para que parezca parte de una misma seccion.
- Mantener transicion, altura y contexto entre las tres vistas.
- Evitar repetir herramientas que ya existen en el menu superior o Perfil.
- Dar a cada pestaña una identidad clara sin romper el sistema visual comun.
- Mantener acciones principales visibles y acciones secundarias dentro del detalle.

### Perfil

- Enfocar Perfil en identidad, seguridad, plan y estado de la cuenta.
- Eliminar accesos redundantes a herramientas financieras.
- Mostrar sync, backup y proteccion como estados resumidos con acceso a Configuracion.
- Añadir soporte, comentarios, privacidad y version sin saturar la portada.

### Configuracion rediseñada

- Separar las secciones:
  - Cuenta
  - Finanzas
  - Apariencia
  - Sonido y vibracion
  - Notificaciones y automatizaciones
  - Datos y backups
  - Seguridad
  - Widgets
  - Permisos y diagnostico
  - Acerca de
- Extraer Widgets de Apariencia.
- Extraer Backup y recuperacion de la tarjeta generica de Datos.
- Dividir componentes de Configuracion demasiado grandes por responsabilidad.
- Añadir descripciones cortas, valores actuales y estados de permiso.
- Crear busqueda solo si la nueva estructura sigue teniendo demasiadas opciones.

### Criterio de salida P1

- La app mantiene una navegacion predecible con una sola mano.
- Ninguna pantalla parece una vista de escritorio comprimida.
- Las acciones principales se encuentran en menos de dos interacciones.
- Los cambios de pestaña, sheets y back se sienten consistentes.
- Todas las pantallas comparten el mismo lenguaje visual.

---

## P1 - Finanzas core

Objetivo: completar los modelos financieros para que las pantallas no dependan
de aproximaciones, campos duplicados o comportamientos implicitos.

### Cuentas

- Completar CRUD, conciliacion e historial de ajustes.
- Respetar `includeInTotal` en todos los calculos, reportes y widgets.
- Separar efectivo, cuentas bancarias, ahorro, credito y otros pasivos.
- Hacer que "Cuentas bancarias" excluya efectivo.
- Explicar sobregiro y limite de credito con lenguaje entendible.
- Añadir cuenta archivada sin obligar a eliminar su historial.
- Mostrar saldo calculado, saldo conciliado y ultima conciliacion.
- Permitir transferencias desde el detalle de cuenta.
- Revisar tratamiento contable de tarjetas de credito y pagos de tarjeta.

### Presupuestos

- Crear historial mensual de limites; no aplicar el presupuesto actual a meses pasados.
- Mantener rollover opcional con explicacion del calculo.
- Añadir alertas configurables por umbral.
- Mostrar gastado, disponible, proyectado y trasladado.
- Crear vista detalle por categoria con movimientos responsables.
- Permitir pausar, archivar y duplicar presupuestos.
- Separar categoria sin limite de categoria con presupuesto cero.
- Añadir presupuesto global mensual opcional.
- Incorporar sobres solo si el modelo resulta claro para usuarios no expertos.

### Metas

- Mantener aportes como fuente de verdad del progreso.
- Completar crear, editar, aportar, retirar y eliminar.
- Mostrar historial con cuenta, fecha, nota y aporte automatico.
- Conectar metas con cuentas de ahorro sin duplicar el mismo dinero.
- Explicar cuando una meta es solo seguimiento y cuando mueve saldo real.
- Añadir estimacion requerida por semana o mes.
- Permitir pausar y reanudar aportes automaticos.
- Crear celebracion discreta y resumen al completar una meta.

### Suscripciones

- Rediseñar el catalogo para telefono: busqueda, categorias y lista compacta.
- Evitar grids enormes y nombres cortados.
- Añadir detalle del servicio, cuenta, proximo cobro y variacion de precio.
- Permitir pausar, saltar, editar y cancelar seguimiento.
- Detectar posibles suscripciones desde movimientos recurrentes.
- Alertar aumentos de precio y cobros duplicados.
- Integrar suscripciones con calendario y flujo de caja.

### Deudas

- Añadir fecha de pago, cuenta, frecuencia, cuota minima y tipo de deuda.
- Separar simulador de deuda de seguimiento real.
- Integrar pagos con movimientos y cuentas.
- Mostrar capital, interes, cuota y fecha estimada de cierre.
- Comparar avalanche y snowball con explicacion simple.
- Incluir deudas en flujo de caja y alertas proximas.

### Recurrencias

- Mantener cada ocurrencia vinculada a su plantilla.
- Garantizar generacion idempotente.
- Permitir saltar, pausar, finalizar y cambiar la siguiente fecha.
- Mostrar historial de ejecuciones y fallos por saldo insuficiente.
- Evitar duplicar una recurrencia al editarla o sincronizarla.

### Categorias y reglas

- Crear gestion clara de categorias de gasto e ingreso.
- Mantener iconos centrados, nombres completos y colores con contraste.
- Permitir editar, archivar y fusionar categorias.
- Evitar eliminar categorias que tengan historial sin ofrecer migracion.
- Convertir reglas aprendidas en una lista visible y editable.
- Mostrar por que se sugirio una categoria.
- Permitir reglas por comercio, texto, cuenta, monto y banco.

### Criterio de salida Finanzas core

- Cada cifra puede rastrearse hasta cuentas y movimientos.
- Los meses historicos no cambian por editar configuraciones actuales.
- Cuentas ocultas, ahorro, credito y transferencias tienen reglas consistentes.
- Automatizaciones no crean movimientos duplicados.

---

## P2 - Analitica e inteligencia financiera

Objetivo: convertir Analisis en una herramienta para tomar decisiones, no en
una coleccion de graficas y porcentajes sin contexto.

### Rediseño de Analisis

- Mostrar primero las graficas y despues la interpretacion.
- Reducir el tamaño de tarjetas de ingresos, gastos y neto.
- Crear secciones claras:
  - Flujo del periodo
  - Gastos por categoria
  - Presupuesto
  - Ahorro
  - Patrimonio
  - Comparativa
  - Insights
- Mantener Semana, Mes y Año sin superponer controles sobre graficas.
- Usar graficas tactiles, legibles y ligeras.
- Permitir tocar un dato para abrir sus movimientos.
- Añadir leyendas, escalas y periodos comprensibles.

### Metricas fiables

- Definir ahorro usando cuentas de ahorro y movimientos relacionados, no una
  formula ambigua.
- Diferenciar ahorro acumulado, ahorro del periodo y tasa de ahorro.
- Guardar tasas historicas para no recalcular el pasado con la tasa actual.
- Separar flujo de caja, patrimonio y balance disponible.
- Explicar activos, pasivos y cuentas excluidas.
- Mostrar presupuesto proyectado sin confundirlo con gasto real.

### Insights accionables

- Explicar por que cambio una cifra y que movimientos influyeron.
- Detectar tendencias por categoria, comercio, cuenta y suscripcion.
- Identificar gastos anormalmente altos sin presentar falsos positivos como hechos.
- Detectar ingresos faltantes o gastos repetidos.
- Mostrar proximos pagos que pueden dejar una cuenta negativa.
- Añadir acciones directas: ver movimientos, crear presupuesto, revisar
  suscripcion, ajustar meta o descartar insight.
- Aprender de insights descartados para reducir ruido.

### Informe anual

- Mantener el nombre profesional "Informe anual" o "Resumen anual".
- Mostrar ingresos, gastos, ahorro, patrimonio y comparativas.
- Incluir mejores y peores meses con contexto.
- Mostrar categorias y comercios principales.
- Generar un resumen visual compartible sin parecer una copia de otra app.
- Exportar imagen y PDF con privacidad configurable.

### Criterio de salida P2 Analitica

- Cada grafica responde una pregunta financiera concreta.
- Tocar cualquier dato importante permite ver su origen.
- Las formulas de ahorro, patrimonio y comparativas estan documentadas.
- Los insights son explicables, descartables y accionables.

---

## P2 - Automatizacion e integraciones Android

### Notificaciones

- Centralizar canales, icono, sonido, vibracion y prioridad.
- Permitir perfiles Silencioso, Suave y Completo.
- Añadir prueba real de sonido y vibracion.
- Evitar avisos duplicados entre notificaciones nativas e in-app.
- Crear acciones utiles: ver, registrar, posponer y descartar.
- Respetar horario silencioso.

### Deteccion bancaria

- Probar notificaciones de Popular, BHD, Banreservas y Scotiabank.
- Mostrar sugerencias pendientes en un inbox claro.
- Explicar banco, cuenta detectada, monto y texto original.
- Evitar registrar automaticamente sin confirmacion mientras la deteccion no
  tenga suficiente confianza.
- Permitir corregir cuenta y categoria, aprendiendo de esa correccion.
- Añadir diagnostico del permiso Notification Listener.

### Recibos y OCR

- Mejorar recorte, rotacion y calidad antes del OCR.
- Mostrar monto, fecha y comercio detectados con nivel de confianza.
- Permitir corregir resultados antes de crear movimientos.
- Procesar lotes sin bloquear la interfaz.
- Evitar conservar imagenes temporales despues de terminar.
- Añadir soporte PDF y comprobantes compartidos desde otras apps.

### Widgets

- Crear configuracion individual por instancia cuando Android lo permita.
- Mantener datos actualizados incluso tras reinicio o actualizacion.
- Mostrar estado offline y fecha de actualizacion.
- Aplicar identidad $harky y Material You sin perder legibilidad.
- Soportar tamaños reales en launchers distintos.
- Considerar un widget unico configurable si simplifica mantenimiento y UX.

### Atajos y deep links

- Mantener accesos directos para gasto, ingreso, transferencia y recibo.
- Verificar que enlaces de autenticacion vuelvan a la app.
- Permitir enlaces internos a cuenta, movimiento, presupuesto o meta.
- Tratar intents repetidos sin abrir dos flujos.

---

## P2 - Accesibilidad, rendimiento y calidad

### Accesibilidad

- Auditar TalkBack en todos los flujos esenciales.
- Añadir nombres accesibles a iconos y botones.
- Mantener orden de foco correcto en sheets y formularios.
- Soportar texto grande sin recortes ni superposiciones.
- Cumplir contraste AA en todos los temas.
- No comunicar estados solo mediante color.
- Respetar reducir movimiento.
- Permitir ocultar montos sensibles rapidamente.

### Rendimiento

- Medir arranque frio y caliente en Android de gama media.
- Reducir trabajo ejecutado en la raiz de `App`.
- Evitar sincronizar widgets, backups o calculos costosos en cada render.
- Memoizar agrupaciones y calculos de movimientos.
- Mantener virtualizacion para historiales largos.
- Dividir pantallas y CSS demasiado grandes.
- Cargar OCR, PDF, Excel y graficas bajo demanda.
- Evitar animar propiedades que fuerzan layout.
- Crear presupuestos de rendimiento para arranque, scroll y memoria.

### Pruebas

- Mantener tests de propiedades para conservar dinero y reversibilidad.
- Añadir fixtures de datos antiguos y migraciones.
- Crear E2E para viewport Android y flujos actuales.
- Automatizar gasto, ingreso, transferencia, borrar, deshacer y editar.
- Automatizar cuentas ocultas, ahorro, presupuestos y metas.
- Probar backup semanal, restore y permisos.
- Añadir pruebas nativas de widgets, deep links, share intents y notificaciones.
- Crear smoke suite en dispositivo antes de cada release.
- Probar actualizacion desde la ultima version publica, no solo instalacion limpia.

### Observabilidad y soporte

- Registrar errores locales con identificador diagnostico.
- Añadir consentimiento para enviar reportes anonimizados.
- Capturar fallos de inicio, sync, backup, widgets y OCR.
- No incluir notas, montos, correos ni nombres en diagnosticos.
- Añadir exportacion del diagnostico para soporte.
- Mostrar estado de salud con acciones de reparacion.

### Seguridad y privacidad

- Mantener PIN, patron y biometria usando Keystore cuando este disponible.
- Explicar si el dispositivo entra en almacenamiento degradado.
- Revisar sesiones, cierre global y eliminacion de datos cloud.
- Validar RLS y Edge Functions de Supabase.
- Minimizar permisos y justificar cada uno en la interfaz.
- Añadir proteccion opcional para exportes y backups locales.
- Definir retencion de recibos temporales, logs y diagnosticos.

---

## P3 - Importacion, exportacion y portabilidad

### Importacion bancaria

- Mantener perfiles reales por banco y version de formato.
- Crear editor visual de columnas.
- Mejorar deteccion automatica de fecha, monto, descripcion y tipo.
- Mostrar vista previa, errores y duplicados antes de confirmar.
- Permitir deshacer una importacion completa.
- Guardar reglas por banco y cuenta.
- Añadir mas fixtures anonimizados de estados de cuenta reales.
- Soportar formatos CSV y Excel cuando sea necesario.

### Exportacion profesional

- Mantener PDF con formato de estado financiero y logo.
- Generar Excel con resumen, meses, categorias, cuentas y presupuesto.
- Permitir CSV filtrado y completo.
- Exportar analitica e Informe anual como imagen.
- Añadir opciones de privacidad: ocultar cuentas, notas o montos.
- Validar que exportes respeten moneda, cuentas ocultas, splits y transferencias.
- Mostrar progreso y permitir cancelar exportaciones largas.

### Migracion entre dispositivos

- Mantener QR para transferencias de datos controladas por el usuario.
- Mostrar progreso por partes y validacion final.
- Detectar versiones incompatibles antes de reemplazar datos.
- Crear snapshot local antes de importar.
- Permitir revisar resumen de lo que se va a reemplazar o combinar.

---

## P3 - Personalizacion y experiencia continua

### Onboarding

- Preguntar moneda, primera cuenta y objetivo principal.
- Explicar local-first, backup y sync sin lenguaje tecnico.
- Crear categorias iniciales adaptadas al usuario.
- Permitir saltar pasos sin bloquear el uso.
- No obligar a crear una cuenta cloud.
- Mostrar tutoriales contextuales solo al descubrir una funcion.

### Personalizacion

- Permitir reordenar u ocultar modulos del resumen.
- Recordar filtros y cuentas favoritas.
- Configurar formato compacto de montos.
- Añadir privacidad rapida para ocultar balances.
- Permitir elegir que aparece en widgets y notificaciones.
- Mantener personalizacion sincronizada solo si el usuario la activa.

### Revision financiera

- Crear una revision semanal breve y opcional.
- Mostrar cambios, gastos destacados, presupuesto y proximos pagos.
- Sugerir una o dos acciones concretas.
- Permitir completar, posponer o desactivar la revision.

---

## P4 - Crecimiento y madurez del producto

### Calidad de publicacion

- Mantener beta interna y pruebas cerradas en Play Store.
- Crear checklist por dispositivo y version Android.
- Publicar changelog orientado a usuarios.
- Mantener politica de privacidad, terminos y eliminacion de cuenta actualizados.
- Definir soporte minimo de Android y politica de actualizaciones.
- Preparar capturas y videos que reflejen la app real.

### Localizacion

- Completar español e ingles en UI, notificaciones, widgets y exports.
- Revisar formatos de fecha, decimal y moneda por region.
- Mantener terminologia financiera consistente.
- Priorizar Republica Dominicana sin impedir uso internacional.

### Feedback de producto

- Añadir feedback contextual opcional.
- Clasificar problemas por pantalla y version.
- Permitir adjuntar diagnostico sin datos financieros.
- Medir fallos y abandono de flujos, con consentimiento.
- Usar feedback para retirar funciones poco utilizadas.

### Funciones futuras a evaluar

- Calendario financiero mas avanzado.
- Proyeccion de flujo de caja por escenarios.
- Activos manuales e inversiones sin cotizacion automatica.
- Gastos compartidos o grupos familiares.
- Objetivos colaborativos.
- Adjuntar garantias, facturas o documentos a movimientos.
- Reglas avanzadas tipo "si ocurre X, hacer Y".
- Asistente financiero explicativo, privado y opcional.
- Integraciones bancarias automaticas solo si existe cobertura segura para RD.

Estas funciones no deben adelantarse a estabilidad, UX, claridad financiera y
calidad Android.

---

## Secuencia recomendada de versiones

### Bloque A - Estabilizacion

- Integridad de movimientos y transferencias.
- Touch, scroll, overlays y back Android.
- Backup semanal funcional.
- Configuracion y widgets verificables.
- Pipeline de release y smoke tests.

### Bloque B - Experiencia

- Sistema visual y navegacion.
- Movimientos y flujo Agregar.
- Informes, Cuentas, Metas y Configuracion.
- Accesibilidad y rendimiento.

### Bloque C - Finanzas

- Presupuestos historicos.
- Cuentas y conciliacion.
- Metas y ahorro.
- Suscripciones, deudas y recurrencias.
- Categorias y reglas.

### Bloque D - Inteligencia

- Analisis rediseñado.
- Metricas explicables.
- Insights y proyecciones.
- Informe anual.

### Bloque E - Plataforma

- Widgets avanzados.
- Notificaciones y automatizaciones.
- OCR e importacion bancaria.
- Exportes y migracion entre dispositivos.

### Bloque F - Madurez

- Onboarding y personalizacion.
- Revision semanal.
- Beta, telemetria privada y soporte.
- Nuevas funciones evaluadas con usuarios.

## Indicadores de calidad

- Cero operaciones financieras duplicadas en pruebas y produccion.
- Cero bloqueos persistentes de scroll o touch.
- Tiempo de registro de gasto frecuente inferior a diez segundos.
- Arranque usable en menos de dos segundos en dispositivo objetivo.
- Cero errores criticos al actualizar desde la version publica anterior.
- Backup automatico verificable y restaurable.
- Cien por ciento de flujos esenciales utilizables con TalkBack.
- Cada cifra agregada puede abrir su desglose.
- Cada permiso y automatizacion muestra su estado real.
- Ninguna nueva funcion se publica sin estado vacio, error, loading y pruebas.

## Prioridad inmediata

1. Integridad financiera y gestos bloqueados.
2. Backup semanal, Configuracion y widgets.
3. Navegacion, sistema visual y flujo Agregar.
4. Movimientos, Cuentas, Presupuestos y Metas.
5. Analisis y metricas financieras.
6. Rendimiento, accesibilidad y pruebas Android.
7. Automatizaciones, importacion, exportacion y nuevas funciones.

$harky ya tiene amplitud funcional. La prioridad debe ser convertir esa amplitud
en una experiencia estable, clara, rapida y coherente antes de seguir agregando
modulos grandes.
