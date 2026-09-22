/** Versión actual de la app, leída de package.json en build time — siempre
 *  coincide con la versión que se sube a la tienda, sin pasos manuales. */
export const APP_VERSION = __APP_VERSION__

/**
 * Nombre de la app, en UN solo sitio.
 *
 * Estaba escrito a mano en la pantalla "Acerca de", en la politica de
 * privacidad, en los terminos y en la notificacion fija. Al cambiar la marca
 * de "$harky" a "Cuadre" quedaron mitad y mitad: la tienda decia un nombre, la
 * app otra, y los documentos legales un tercero. Un documento legal que nombra
 * un producto que no existe no sirve de nada.
 */
export const APP_NAME = 'Cuadre'

/**
 * Una entrada del changelog.
 *
 * Los items se escriben con un PREFIJO opcional que dice de qué tipo son, y
 * la pantalla los agrupa por eso:
 *
 *   'nuevo: ...'      una función que antes no existía
 *   'mejor: ...'      algo que ya estaba y ahora funciona mejor
 *   'arreglo: ...'    un bug corregido
 *
 * Sin prefijo se trata como "mejor". Existe porque una lista de veinte
 * puntos donde todos pesan igual no se lee: nadie distingue "rediseñamos
 * Cuentas" de "corregimos un margen", y acaba sin leer ninguno.
 */
export type ReleaseItemKind = 'new' | 'better' | 'fix'

export interface ReleaseItem {
  kind: ReleaseItemKind
  text: string
  /** true para lo que de verdad importa de esa versión: se muestra primero. */
  highlight?: boolean
}

export interface ReleaseNote {
  version: string
  date: string
  title: string
  items: string[]
}

const PREFIXES: Array<[string, ReleaseItemKind]> = [
  ['nuevo:', 'new'],
  ['mejor:', 'better'],
  ['arreglo:', 'fix'],
]

/**
 * Convierte los items en texto plano a items tipados. El texto viejo (sin
 * prefijo) sigue funcionando: se clasifica por su contenido, para que las
 * versiones anteriores no haya que reescribirlas.
 */
export function parseReleaseItems(items: string[]): ReleaseItem[] {
  return items.map(raw => {
    const lower = raw.toLowerCase()
    for (const [prefix, kind] of PREFIXES) {
      if (lower.startsWith(prefix)) {
        return { kind, text: raw.slice(prefix.length).trim() }
      }
    }
    // Compatibilidad con las entradas antiguas, que no llevan prefijo.
    if (lower.startsWith('corregido')) {
      return { kind: 'fix', text: raw.replace(/^corregido(\s*\(grave\))?:?\s*/i, '').trim(), highlight: /grave/i.test(raw) }
    }
    return { kind: 'better', text: raw }
  })
}

/** Cuántos items de cada tipo tiene una versión, para resumirla de un vistazo. */
export function countByKind(items: ReleaseItem[]): Record<ReleaseItemKind, number> {
  return items.reduce((acc, item) => {
    acc[item.kind]++
    return acc
  }, { new: 0, better: 0, fix: 0 } as Record<ReleaseItemKind, number>)
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.9.5',
    date: '2026-09-20',
    title: 'Tu tarjeta, como la lee tu banco',
    items: [
      'arreglo: GRAVE - una tarjeta con el disponible escrito en el saldo salia como si no se hubiera usado: el cupo entero libre y el boton de pagar ofreciendo cero.',
      'nuevo: Ya puedes escribir lo que te queda DISPONIBLE en la tarjeta, que es lo que muestra tu banco. La app calcula sola lo que debes.',
      'arreglo: La fila de saldo a favor mostraba RD$ 0.00 teniendo dinero a favor.',
      'arreglo: Desde la notificacion fija, "Gasto" no abria nada si era lo ultimo que habias abierto. "Ingreso" si. Ahora los dos.',
      'arreglo: Tocar dos veces el mismo aviso ya no se queda sin hacer nada la segunda.',
      'arreglo: "Escribenos" en Sobre nosotros dejaba la app en una pantalla de error.',
      'arreglo: Un aviso detectado con la fecha daniada mostraba "Invalid Date".',
      'arreglo: La app seguia llamandose por su nombre viejo en la pantalla de bienvenida, en los PDF y Excel exportados, en los respaldos y al desbloquear con huella.',
      'arreglo: El tiburon de la marca vieja seguia en el onboarding, en los avisos, en las pantallas vacias y en la de error.',
      'mejor: Editar una cuenta se rehizo entera: ya no flota con un hueco negro debajo, no se desliza por dos sitios a la vez y deja mas sitio a los campos que a la decoracion.',
      'mejor: Las notificaciones ocupan menos pantalla, entran con mas calma y cada aviso cabe entero. Antes el monto y el boton de agregar se salian por el borde.',
      'mejor: Se acabo el menu de copiar al dejar pulsado en cualquier sitio. Ahora solo se copia lo que es un dato: montos y conceptos.',
      'mejor: Cuentas es solo Cuentas. Metas se abre desde el menu, y la pantalla gana el espacio del selector.',
    ],
  },
  {
    version: '1.9.4',
    date: '2026-09-20',
    title: 'Las tarjetas, cuadrando de verdad',
    items: [
      'arreglo: GRAVE - en una tarjeta de credito, el saldo que escribias se guardaba al reves: tecleabas lo que debias y la app entendia que el banco te debia a ti. La tarjeta decia "no debes nada" y el boton de pagar ofrecia RD$ 0.00.',
      'arreglo: GRAVE - al editar una cuenta, "Detalles" se recortaba solo y dejaba visible una sola fila: no se podia cambiar ni el limite, ni el banco, ni el ciclo, ni nada.',
      'nuevo: Ya puedes pagar la linea en dolares de tu tarjeta por separado, con su propio saldo y su propio boton.',
      'arreglo: Los centavos volvieron a la franja de Movimientos.',
      'mejor: Las notificaciones abren desde el lateral derecho, sin tapar la barra de abajo.',
      'arreglo: En el calendario, el dia que tocas se marca de verdad. Y "hoy" ya no desaparece al seleccionar otro dia.',
      'mejor: El buscador mantiene la barra a la vista al desplazar, marca el foco y trae boton para borrar.',
      'nuevo: "Acerca de" cuenta que es la app, no solo su version.',
      'arreglo: Cuadre se llama Cuadre en todas partes: la notificacion fija, los terminos y la politica de privacidad seguian con el nombre viejo.',
      'arreglo: Con la letra grande, los avisos y el carrusel de tarjetas se salian de la pantalla — la X de cerrar quedaba fuera.',
      'arreglo: La deteccion de transacciones se reconecta sola al abrir la app. Android la soltaba al actualizar y quedaba muerta en silencio.',
      'nuevo: Si la deteccion lleva dias sin capturar nada, la campanita te lo dice y te lleva a arreglarlo. Antes podias pasar meses sin enterarte.',
      'arreglo: La ficha de la tarjeta decia "Utilizado 40%" y al lado ponia el cupo DISPONIBLE, no lo usado.',
      'arreglo: Un saldo a favor en una tarjeta se leia como deuda. Ahora lo dice.',
    ],
  },
  {
    version: '1.9.2',
    date: '2026-09-20',
    title: 'Cuadre: nombre e icono nuevos',
    items: [
      'nuevo: La app se llama Cuadre y estrena icono: dos tarjetas, no una pirámide.',
      'arreglo: Analisis comparaba el mes a medias contra el mes pasado entero, asi que casi siempre decia que ibas mejor de lo que ibas.',
      'arreglo: En el carrusel, los dos saldos de una tarjeta se montaban encima de sus ultimos 4 digitos.',
      'arreglo: Cifras cortadas con puntos suspensivos en Metas, en el resumen de la semana y en los saldos de la ficha.',
      'mejor: El aviso de "ponle un PIN" ya no aprieta su texto en una columna de seis palabras.',
      'mejor: Los datos de demostracion enseñan la app completa: red de la tarjeta, deuda en dolares, ciclo y tasa.',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-09-20',
    title: 'Cuentas y Analisis rediseniados',
    items: [
      'nuevo: Cuentas rediseniada. Tu dinero y tus tarjetas ya no comparten la misma fila.',
      'nuevo: Tu proximo pago de tarjeta, arriba del todo. Y puedes pagarla desde ahi.',
      'nuevo: Elige tu banco de una lista con mas de 60 entidades.',
      'nuevo: Las tarjetas muestran su red: Visa, Mastercard, Amex.',
      'nuevo: Cupo aparte para la linea en dolares, si tu tarjeta lo maneja asi.',
      'nuevo: Analisis abre diciendote como vas, en una frase.',
      'nuevo: Si el banco avisa de una compra que ya registraste, te lo dice antes de agregarla.',
      'mejor: Conciliar saldo esta al frente, no al fondo.',
      'mejor: El Efectivo es uno solo. Para guardar aparte, usa una cuenta de Ahorro.',
      'mejor: El onboarding te deja con tus saldos cargados, no con una app vacia.',
      'mejor: "Anual" ahora vive dentro del periodo anual de Analisis.',
      'mejor: Las notificaciones se ordenaron por lo que pide tu atencion.',
      'mejor: La app abre casi 2 segundos mas rapido.',
      'arreglo: GRAVE - la deuda en dolares no contaba en tu patrimonio.',
      'arreglo: Los gastos en dolares se veian como pesos en el historial de la cuenta.',
      'arreglo: La ficha de una cuenta se veia rota: cabecera pegada y grafico sin dibujar.',
      'arreglo: Ahora puedes tocar un movimiento del historial para editarlo.',
      'arreglo: Al editar un movimiento ya se puede cambiar su divisa.',
      'arreglo: Los gastos en dolares no cuadraban en calendario ni en flujo de caja.',
      'arreglo: Las Novedades no aparecian al actualizar.',
      'arreglo: Un aviso del banco en dolares se registraba como pesos.',
      'arreglo: Los recurrentes solo se generaban al abrir la app.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-09-19',
    title: 'Multi-moneda real y tarjetas de credito de verdad',
    items: [
      'Registra un gasto en cualquier divisa: toca la banderita junto al monto y elige la moneda. La conversion se muestra antes de guardar, con la tasa usada.',
      'La tasa de cambio se congela al guardar. Tu historial deja de cambiar solo cada dia y los meses cerrados siguen cuadrando.',
      'Las tarjetas de credito ahora manejan DOS saldos: uno en pesos y otro en dolares. Un gasto en dolares golpea el saldo en dolares, sin convertirse.',
      'Ciclo de tarjeta: dia de corte, dia de pago y pago minimo. El pago se marca en ambar cuando faltan 5 dias o menos.',
      'Aviso de interes: si pagas solo el minimo, la app te dice cuantos anos tarda y cuanto cuesta en intereses. Y avisa si la deuda no se termina de pagar nunca.',
      'Comisiones bancarias al registrar un gasto a mano: recargo por compra en divisa, impuesto 0.15% (Ley 288-04) y avance de efectivo, con perfiles para Banreservas, Popular, BHD, Scotiabank, APAP, Caribe, Promerica y Santa Cruz. Siempre desglosadas antes de guardar. En los movimientos que vienen de un aviso del banco o de un CSV no se suman, porque ese monto ya los trae incluidos.',
      'Tus tarjetas de credito entran solas al simulador de pago de deudas. Ya no hay que teclear la misma deuda dos veces.',
      'Nueva seccion "Salud de datos" en el Perfil: ve si tus saldos cuadran, cuales no y por cuanto, y reparalos sin perder nada.',
      'Nueva seccion "Novedades" en el Perfil con el historial completo de versiones.',
      'Corregido: las cuentas en otra divisa mostraban su saldo con el simbolo equivocado (una cuenta en US$ se veia como RD$). Afectaba 13 pantallas.',
      'Corregido: el badge "auto" de los movimientos detectados por aviso bancario se borraba al guardarlos.',
      'Corregido: el limite de credito solo miraba el saldo en pesos, y dejaba pasar gastos en una tarjeta ya al tope por su deuda en dolares.',
      'Corregido: "Recalcular saldos" arreglaba el saldo principal y dejaba el de divisa extranjera derivando en silencio.',
      'Corregido (grave): la copia de seguridad semanal solo se guardaba si el telefono despertaba justo el dia elegido. Si se perdia ese dia, se saltaba la semana entera sin avisar. Ahora, si la copia esta vencida, se guarda en la primera oportunidad — y tambien al abrir la app.',
      'La copia de seguridad ahora se fuerza al mandar la app a segundo plano, para que el ultimo gasto que registraste entre en ella.',
      'Salud de datos avisa si nunca elegiste carpeta de copia, si la carpeta dejo de ser accesible o si la copia esta vieja. Antes todo eso fallaba en silencio.',
      'Corregido: un aviso del banco en dolares registraba el gasto como si fueran pesos.',
      'Corregido: los gastos en divisa extranjera no contaban bien contra los presupuestos, ni en el calendario, ni en la proyeccion de flujo de caja.',
      'Notificaciones reordenadas por urgencia: saldo bajo y pagos que vencen suenan; el resumen semanal, las metas y las alertas de divisa llegan en silencio a la bandeja. Antes las ocho categorias interrumpian con la misma fuerza.',
      'Las notificaciones ahora se agrupan, y estan traducidas de verdad: antes llegaban siempre en espanol aunque tuvieras la app en ingles.',
      'El recordatorio de "hace dias que no registras nada" pasa a ser el aviso mas discreto del sistema.',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-06-10',
    title: 'Privacidad y eliminacion de datos en la nube',
    items: [
      '"Eliminar todos los datos" ahora tambien borra tu copia sincronizada en Supabase, no solo los datos locales.',
      'Politica de privacidad y terminos de uso publicados como paginas web publicas.',
      'Correcciones de inicio de sesion con Google.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-06-04',
    title: 'UX profesional completa',
    items: [
      'Dialogos propios para confirmaciones destructivas.',
      'Filtro guardado con modal de texto propio.',
      'Cero dialogos nativos del navegador en flujos de usuario.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-06-04',
    title: 'Calidad de datos y recuperacion',
    items: [
      'Snapshot automatico antes de restaurar backups.',
      'Estado de datos visible en Configuracion.',
      'Pruebas de fixtures legacy, backups corruptos y restauracion segura.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-06-03',
    title: 'Distribucion y operacion',
    items: [
      'Carga inicial optimizada con vistas y exporters bajo demanda.',
      'Changelog visible dentro de Configuracion.',
      'Canal estable/beta preparado como preferencia operativa.',
      'Telemetria local opcional para diagnosticar errores sin enviar datos por defecto.',
      'Proceso de release documentado para build, pruebas, hashes y publicacion.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-03',
    title: 'Reportes y decision financiera',
    items: [
      'Sensibilidad configurable para gastos atipicos.',
      'Suscripciones detectadas convertibles en recurrencias mensuales.',
      'Resumen ejecutivo para Excel y PDF mensual.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-02',
    title: 'CSV bancario dominicano',
    items: [
      'Perfiles para bancos y tarjetas principales.',
      'Vista previa con mapeo manual y conciliacion flexible.',
    ],
  },
]
