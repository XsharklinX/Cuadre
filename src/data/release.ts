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

/**
 * Una version publicada.
 *
 * SOBRE `date`: la entrada mas nueva lleva SIEMPRE la fecha del dia en que se
 * publica, y las anteriores se separan entre si por dias o semanas. Ninguna
 * comparte fecha con otra: un changelog con cuatro versiones el mismo dia se
 * lee como un volcado, no como un producto que avanza.
 */
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
        const body = raw.slice(prefix.length).trim()
        /*
         * Marcador de importancia: `arreglo: !`
         *
         * El `!` NO se imprime — marca la línea para que se pinte destacada.
         * Antes se escribía "GRAVE -" dentro del texto y salía literal en la
         * pantalla del usuario, que ni sabe ni tiene por qué saber qué es un
         * fallo grave: solo quiere leer qué cambió.
         */
        const important = body.startsWith('!')
        return {
          kind,
          text: important ? body.slice(1).trim() : body,
          ...(important ? { highlight: true } : {}),
        }
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
    version: '2.8.0',
    date: '2026-10-30',
    title: 'Análisis claro, Negocio y Suscripciones al día',
    items: [
      'nuevo: !Análisis que contesta: «Te sobraron…» arriba, lo que hay que mirar en una tarjeta y cada detalle a un toque.',
      'nuevo: !El buscador agrupa por comercio y suma: cuánto llevas en el súper, mes a mes, con filtros y sugerencias.',
      'nuevo: !Suscripciones: el mes con los logos en su día, una sola lista y la historia de precio de cada una.',
      'nuevo: !Ganancia como una meta: lo que te dejó el negocio y cada servicio en su fila.',
      'nuevo: Compara con el mes anterior, el año pasado o tu media; preguntas rápidas; el año con su propia lectura.',
      'nuevo: Comparte el resumen del mes con vista previa, también solo en porcentajes.',
      'nuevo: Repaso de suscripciones y aviso antes del cobro de la que elijas.',
      'mejor: Formularios de Negocio cortos: el monto arriba y filas que se tocan. Un negocio se crea en un paso.',
      'mejor: Cobros atrasados agrupados por persona; la ficha del servicio con sus plazas.',
      'mejor: Patrimonio vive ahora en Cuentas.',
      'mejor: Las pantallas de la 2.7 vuelven a la cara de Cuadre.',
      'arreglo: El súper ya no se detecta como suscripción y las fechas salen en palabras.',
    ],
  },
  {
    version: '2.7.0',
    date: '2026-10-29',
    title: 'Menos formularios, más claridad',
    items: [
      'nuevo: !Deudas con la fecha en que quedas libre, una línea de tiempo y cuánto adelantas pagando un extra.',
      'nuevo: !Toca un movimiento y verás su recibo: cambia la categoría, la cuenta o la fecha en el sitio.',
      'nuevo: !Presupuestos dicen cuánto te queda y cuánto puedes gastar al día hasta fin de mes.',
      'nuevo: !Flujo de caja con tu saldo día a día, el punto más bajo avisado con tiempo y «probar un gasto» antes de comprar.',
      'nuevo: Cada deuda con sus pagos y lo que te cuesta en intereses este mes.',
      'nuevo: Aviso dos días antes de que venza una cuota.',
      'nuevo: Al cambiar un presupuesto, te propone lo que sueles gastar.',
      'nuevo: Listas: escribe «3 pollo 380» y entra con cantidad y precio.',
      'mejor: Caprichos en una sola pantalla; un antojo listo se decide en un toque.',
      'mejor: Crear una deuda o un presupuesto es completar una frase.',
      'mejor: Los avisos al abrir la app se juntan en uno.',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-10-29',
    title: 'Análisis de un vistazo y Negocio de hoy',
    items: [
      'nuevo: !Análisis sin cajones: Resumen, Ritmo, Categorías, Días y Patrimonio, todo a la vista.',
      'nuevo: !Barras de gasto por día y el ritmo del mes contra el anterior, con el cierre previsto.',
      'nuevo: !Toca una categoría para ver sus seis meses y en qué se fue.',
      'nuevo: !Negocio abre en «Hoy»: quién paga hoy, quién va atrasado y cómo va el mes.',
      'nuevo: Calendario de qué días gastas más y tu piso de gastos fijos.',
      'nuevo: Cuándo llegas a tus metas, marcado en el patrimonio.',
      'nuevo: Cobros en agenda, recordar a todos los atrasados por WhatsApp y meta de cobro del mes.',
      'nuevo: Plazas libres, quién te deja más y la puntualidad de cada cliente.',
      'nuevo: Ver un ejemplo de Negocio antes de empezar.',
      'nuevo: Menú ☰ con el dato de cada herramienta, buscador, avisos y favoritas.',
      'mejor: Comparar dos meses con barras.',
      'mejor: El resumen del domingo compara con la semana anterior.',
      'mejor: Perfil queda solo con tu cuenta.',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-10-29',
    title: 'Metas nuevas y formularios que caben',
    items: [
      'arreglo: !Al editar un movimiento, la fecha quedaba tapada en pantallas pequeñas o con la letra grande. Ahora va arriba, junto al monto.',
      'nuevo: !Metas rediseñadas: anillo grande y un estado que dice si vas en camino, adelantado o atrasado.',
      'nuevo: !Aporta en dos toques desde el «+» de cada meta, con montos sugeridos.',
      'nuevo: !Mantén pulsado un movimiento para cambiarle la fecha, la categoría o la cuenta sin abrirlo.',
      'nuevo: Cada meta enseña lo ahorrado contra lo que tocaba, y un simulador de «¿y si aporto más?».',
      'nuevo: Saca dinero de una meta, pausa su aporte automático o márcala como lograda.',
      'nuevo: Ordena tus metas; la primera es la principal.',
      'nuevo: Crear una meta ahora va en tres pasos cortos.',
      'mejor: El botón de guardar dice qué falta y te lleva al campo.',
      'mejor: Si cierras un formulario con cambios, te pregunta antes de descartarlos.',
      'mejor: Las hojas se cierran deslizando hacia abajo y salen con animación.',
      'mejor: Los menús del sistema se cambiaron por selectores de la app.',
      'mejor: El «+» ofrece lo de la pantalla donde estás.',
      'mejor: Suscripciones, Deudas y Flujo de caja están en el menú ☰.',
      'mejor: En móviles modestos la app usa menos efectos para ir más fluida.',
      'arreglo: En «Aportar» se colaba un texto suelto detrás de la hoja.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-10-24',
    title: 'Negocio a fondo',
    items: [
      'nuevo: !Negocio tiene tres pestañas: Clientes, Cobros y Ganancia.',
      'nuevo: !Los servicios se pagan solos el día que toca, o te avisan y un toque lo registra. Tú eliges en cada uno.',
      'nuevo: !Estrellas: cada cliente que te trae a otro paga un porcentaje menos. Se pone sola al decir quién lo recomendó.',
      'arreglo: !Mover un servicio ahora se lleva su dinero: la ganancia sale de lo que cobras y pagas, no de la categoría.',
      'arreglo: !Las hojas de Negocio se quedaban fijas: no se podía bajar al editar un cliente ni al elegir el día de pago.',
      'arreglo: !Las cuentas de un servicio colocan solos a los clientes que ya tenías.',
      'arreglo: «Debe» solo cuenta lo vencido, no los cobros que todavía no tocan.',
      'arreglo: Los logos de los servicios ya no salen estirados.',
      'arreglo: Los avisos del teléfono no se actualizaban si tenías algún movimiento recurrente.',
      'arreglo: El aviso del dólar salía con textos como {verb} y {rate} en vez de las cifras.',
      'nuevo: Busca clientes por nombre o teléfono, fíltralos y ordénalos.',
      'nuevo: Mantén pulsado para elegir varios y cambiarles el precio o el servicio de una vez.',
      'nuevo: Desliza un cliente a la izquierda para copiar el recordatorio de pago.',
      'nuevo: La ficha del cliente cuenta su historia: pagos, atrasos, cambios de precio y estrellas.',
      'mejor: Borrar un cliente está en su menú, y puedes guardar lo que te pagó.',
      'nuevo: Cada servicio tiene su pantalla: resumen, cuentas, clientes y pagos.',
      'nuevo: Une dos servicios: «Netflix Sub 2» pasa a ser la cuenta 2. También negocios repetidos.',
      'nuevo: Cada cuenta se edita y se cierra, y dice lo que te deja o te cuesta.',
      'nuevo: Crea un servicio tocando su logo y pon lo que cobras por plaza.',
      'nuevo: Cobra a varios de una vez con «Cobrar los N».',
      'nuevo: Categorías, cuentas, servicios y negocios se crean ahí mismo, sin salir.',
      'nuevo: Un negocio nuevo propone sus propias categorías.',
      'nuevo: Ganancia muestra los próximos meses, con los pagos anuales en su mes.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-10-23',
    title: 'Servicios, Negocio y Análisis',
    items: [
      'arreglo: !«Has puesto» contaba gastos personales de categorías compartidas. Ahora suma solo lo que pagaste por tus servicios.',
      'arreglo: !El ahorro por pagar por adelantado salía en planes mensuales. Solo aparece en planes de varios meses.',
      'arreglo: !Un negocio ya creado no se podía editar. Ábrelo en Ganancias y toca «Editar negocio».',
      'arreglo: Al tocar un formulario se movía lo que había detrás.',
      'arreglo: En el historial de Cobros el texto se encimaba con el fondo de deslizar.',
      'arreglo: El icono de tu perfil se veía cortado.',
      'nuevo: Mira la ganancia de un negocio en pesos o en dólares, y todas sus cifras cambian.',
      'mejor: La tarjeta de ganancia abre por capas: lo puesto y el año, cuando los pides.',
      'mejor: El gráfico del año marca el mejor y el peor mes.',
      'mejor: Negocio tiene un botón principal; el resto va en un menú.',
      'nuevo: Los clientes se agrupan bajo su servicio, con las plazas ocupadas.',
      'nuevo: Cada cliente dice si está al día, si debe o cuándo le toca.',
      'nuevo: El botón + en Negocio ofrece crear cliente, cobro, servicio, negocio o movimiento.',
      'mejor: Un negocio nuevo se crea en tres pasos y te dice cuánto habría cobrado.',
      'mejor: La ficha de cliente, nueva: avatar y nombre arriba, el monto en grande y lo demás en tarjetas.',
      'mejor: Cuenta, categoría, negocio y servicio se eligen tocando, sin listas desplegables.',
      'nuevo: Un servicio puede tener varias cuentas, con la cara de quien ocupa cada plaza.',
      'nuevo: Al escribir Netflix o Spotify, la app propone sus plazas.',
      'nuevo: Cada servicio dice cuánto te cuesta cada plaza, cuándo toca pagar y lo que ya pagaste.',
      'nuevo: Si un servicio pierde dinero, te dice cuántos clientes o qué precio lo arreglan.',
      'mejor: Análisis abre con una frase, lo que entró, salió y queda, y lo que más cambió.',
      'nuevo: Análisis enseña cuánto vino del negocio, lo que te deben, caprichos y antojos.',
      'nuevo: Compara dos meses cualesquiera, lado a lado.',
      'nuevo: Una barra muestra a dónde se fue el mes.',
      'mejor: Las secciones de Análisis que más abres suben solas.',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-10-22',
    title: 'La barra, Negocio y Caprichos',
    items: [
      'mejor: Tu perfil, los avisos y los ajustes están ahora en tu avatar. La barra de arriba tiene tres botones menos.',
      'nuevo: Mantén pulsado el saldo y se tapan todos los montos. Lo sueltas y vuelven.',
      'mejor: El calendario sale solo en Movimientos, que es donde sirve.',
      'nuevo: Tus servicios salen con el logo de su marca.',
      'mejor: Cada negocio se tiñe con el color que le pusiste.',
      'mejor: Cobros abre con la cifra en grande y sin caja alrededor.',
      'nuevo: La ficha de un cliente lleva su avatar, desde cuándo lo es y sus servicios con el precio de cada uno.',
      'nuevo: Con dos o más negocios, la ganancia de todos junta arriba.',
      'nuevo: Mueve un servicio a otro negocio. Sus clientes van con él.',
      'nuevo: Ordena tus negocios a mano y archiva los que ya no llevas.',
      'nuevo: Cambia a un cliente de servicio desde su ficha.',
      'nuevo: La app encuentra dos fichas de la misma persona y te ofrece unirlas.',
      'nuevo: Antes de unir ves cómo queda la ficha, y se puede deshacer.',
      'nuevo: Si escribes el nombre de un cliente que ya tienes, la app te lleva a su ficha.',
      'nuevo: Antojos: apunta lo que quieres antes de comprarlo y espera siete días.',
      'nuevo: Lo que no compraste puede irse a tu ahorro de verdad, y de ahí al bote.',
      'nuevo: Ponle fecha a un capricho y la app te dice cuánto abonar al mes.',
      'nuevo: Al crear un gasto te pregunta si es un capricho, cuando sueles marcar esa categoría.',
      'nuevo: Logros: lo recuperado del año y en qué caes más.',
      'mejor: El bote se llama Caprichos, y el bote es una de sus tres pestañas.',
      'nuevo: Pasa de pestaña deslizando el dedo.',
      'mejor: Las listas entran fila por fila en vez de aparecer de golpe.',
      'mejor: Las hojas se cierran arrastrándolas hacia abajo.',
      'nuevo: Desliza un cobro hacia la derecha para cobrarlo.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-10-22',
    title: 'Negocio, a fondo',
    items: [
      'mejor: Cobros abre con lo que hay que hacer HOY y con el nombre de quién peor está, en vez de tres cifras que había que comparar cada mañana.',
      'nuevo: Cada cliente tiene su ficha: cuánto te ha pagado, en cuántos cobros, cuántos meses seguidos y qué le queda. Antes tocarlo abría su formulario de ajustes.',
      'mejor: La lista de cobros va agrupada —atrasados, esta semana, más adelante— y lo cobrado se va a su historial. Lo cobrado no es una tarea.',
      'mejor: La ganancia de un negocio en grande, con su MARGEN en porcentaje y las tres cifras de las que sale. El monto solo no dice si el negocio es bueno.',
      'nuevo: Cobro suelto. Si un cliente de siempre te encarga un trabajo puntual, se le añade sin tocar su cobro fijo ni crear otra ficha.',
      'nuevo: Un cliente puede comprarte VARIOS servicios, cada uno con su precio. Antes había que inventarse un segundo cliente con el mismo nombre.',
      'nuevo: «Otro igual» duplica el trato de un cliente —servicio, precio, día— sin su historial ni su teléfono. Solo le pones el nombre.',
      'mejor: El día de pago se elige tocando el día, en una rejilla con los 31. Era un campo donde había que borrar lo de delante para poner lo de atrás.',
      'nuevo: Comprobante de pago en PDF. Cuando alguien te paga, le mandas el papel desde su ficha.',
      'nuevo: Estado de cuenta del año por cliente: lo facturado contra lo pagado, mes a mes. Para cuando alguien dice que ya pagó.',
      'nuevo: Exportar tus cobros a Excel o a PDF, para llevarlos fuera o pasárselos a un contable.',
      'nuevo: El resumen del mes de un negocio, como imagen, para guardarlo o mandarlo.',
      'nuevo: Cada cobro puede llevar su nota: «este mes le hice además el logo». Es de esa vez, no del cliente.',
      'nuevo: La app recuerda lo que le cobrabas antes. Un precio que lleva dos años sin tocarse es dinero que se pierde sin que nadie lo note.',
      'nuevo: Apartar un % de cada cobro ya MUEVE el dinero a la cuenta que elijas, en vez de solo recordarte que lo apartes.',
      'nuevo: Informes con un filtro de Negocio o Personal. Lo que ganas vendiendo y lo que gastas viviendo no se comparan.',
      'nuevo: Agrupar tus clientes por servicio, para saber de un golpe quién está en cada cuenta.',
      'nuevo: Si revendes una suscripción, díselo a la app: deja de contar como gasto tuyo, porque lo cubren tus clientes.',
      'nuevo: Flujo de caja cuenta lo que te deben, en la fecha en que ESE cliente suele pagar —no en la que debería—.',
      'nuevo: Mantener pulsado el icono de la app lleva directo a Cobros.',
      'nuevo: Negocio vacío explica sus cuatro pasos, y desaparece con tu primer cliente.',
      'nuevo: Salud de datos ya mira tus clientes, tus cobros y tus botes, y arregla lo que no necesita que decidas nada.',
      'mejor: El aviso de un cobro atrasado llega el día que vence, a los 3 días y a los 7, y luego calla. Antes llegaba todos los días.',
      'arreglo: ! Cerrar un período borraba las fotos de recibo de todo lo archivado.',
      'arreglo: ! Un cliente puntual figuraba como «paga 1 día tarde» por haber pagado a su hora el mismo día.',
      'arreglo: Un centenar de textos en español les faltaban las tildes: «Dia de corte», «Pago minimo», «{y} anos y {m} meses».',
      'arreglo: Con dos hojas abiertas, la tecla Escape cerraba las dos y te devolvía a la lista en vez de a donde estabas.',
      'mejor: La pestaña de Ganancia ya no recorre el libro doce veces por negocio cada vez que se repinta.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-22',
    title: 'Cobros, ganancia y cuadrar con tu banco',
    items: [
      'nuevo: Clientes y cobros. Registra a quién le cobras, cada cuánto y en qué cuenta deposita; la app te dice quién se atrasó y anota el pago de un toque.',
      'nuevo: Lo que te deben NO suma a tu balance hasta que llega. Un cobro esperado es una expectativa, no dinero.',
      'nuevo: Negocios con su ganancia de verdad: lo cobrado menos lo que te cuesta, al mes y en el año, con su gráfica.',
      'nuevo: Los servicios se pueden pagar al mes, al trimestre o al AÑO. Una suscripción anual cuenta su parte cada mes en vez de arruinar un mes y regalar once.',
      'nuevo: Cada cliente y cada servicio con su propia divisa: pesos y dólares conviven sin mezclarse.',
      'nuevo: Margen por servicio: lo que pagas contra lo que revendes, y cuántos clientes necesitas para no perder dinero.',
      'nuevo: Cada negocio puede llamar a las cosas como quiera: cliente, estudiante, inquilino, paciente.',
      'nuevo: Cuadrar con tu banco, todas las cuentas de una pasada. Nunca sobreescribe tu saldo: anota un ajuste visible.',
      'arreglo: ! Cuadrar aparecía en tus informes como un ingreso o un gasto que nadie hizo. Los ajustes ya no ensucian el mes ni el presupuesto.',
      'nuevo: Cuando puede, la app te dice DE DÓNDE salió el descuadre en vez de solo cuánto.',
      'nuevo: Empezar de nuevo desde hoy, para un libro que derivó demasiado. No borra nada: lo anterior queda como historial.',
      'nuevo: El bote de los caprichos. Marca un gasto y recupera su monto con movimientos reales, nunca con un botón.',
      'arreglo: ! El aviso de tasa de cambio no decía el valor del dólar: el título era tu límite. Ahora el título ES la cifra, y dice cuánto se movió.',
      'arreglo: ! El aviso de tasa de cambio llegaba en español aunque tuvieras la app en inglés.',
      'mejor: La racha salió de Movimientos. Esa pantalla es para dinero; la racha avisa en los días redondos y nada más.',
      'nuevo: El widget enseña lo que te deben esta semana, y te avisa el día que un cliente debe pagarte.',
    ],
  },
  {
    version: '1.9.12',
    date: '2026-10-18',
    title: 'La app ahora se siente',
    items: [
      'mejor: Todo lo que pulsas devuelve un toque. La app responde al dedo en vez de quedarse quieta.',
      'mejor: Ingresos y gastos suenan distinto, asi sabes cual guardaste sin mirar.',
      'mejor: Al guardar, el movimiento cae en su sitio en la lista en vez de aparecer puesto.',
      'nuevo: Tu racha de dias anotando. Si se rompe, no pasa nada: vuelve a empezar sin regaños.',
      'nuevo: Las metas celebran el cuarto, la mitad y los tres cuartos del camino, no solo el final.',
      'nuevo: Cuando cierras un mes gastando menos de lo que entro, la app te lo dice con la cifra que te sobro.',
      'mejor: Las cifras de tus tarjetas llegan contando en vez de aparecer de golpe.',
      'mejor: Las barras de presupuesto crecen al abrir la pantalla, asi se leen como lo que son.',
      'mejor: Las tarjetas se inclinan al deslizarlas, con el brillo moviendose con ellas.',
      'nuevo: Tira de la lista hacia abajo para actualizar las tasas de cambio al momento.',
      'nuevo: Papelera de 30 dias. Lo que borras se puede recuperar, no solo en los 5 segundos del aviso.',
      'nuevo: La foto del recibo se guarda con el movimiento, en vez de tirarse despues de leerla.',
      'arreglo: ! Si guardar fallaba, el aviso duraba 3 segundos y el movimiento se perdia sin dejar rastro. Ahora queda apuntado con el motivo y se puede reintentar.',
      'nuevo: La app avisa si el detector lleva dias sin captar nada, aunque siga encendido.',
      'nuevo: Te recuerda hacer copia de seguridad si llevas mucho sin una. Tus datos viven solo en tu telefono.',
      'mejor: Buscar un numero encuentra tambien los montos parecidos, no solo el exacto.',
      'mejor: Al agregar, el monto manda hasta que lo escribes: la cifra crece y las categorias se apartan.',
      'mejor: Guardar y Cancelar bajaron a donde llega el pulgar, en vez de las esquinas de arriba.',
    ],
  },
  {
    version: '1.9.11',
    date: '2026-10-17',
    title: 'La app se ve mejor y el detector funciona',
    items: [
      'arreglo: ! La deteccion de movimientos por notificacion no se encendia aunque dieras el permiso. Ya se enciende sola.',
      'nuevo: Puedes repartir un gasto entre varias categorias, con el orden numerado y una X para soltarlas.',
      'mejor: El icono tiene profundidad de verdad, y al abrir la app ya no salta de color.',
      'mejor: Las tarjetas parecen plastico: canto iluminado, chip con relieve y cifras grabadas.',
      'mejor: Las hojas suben desde abajo con su asa, sobre un fondo desenfocado.',
      'mejor: Al cambiar de pestaña, la pantalla entra por el lado hacia el que te moviste.',
      'mejor: La grafica de patrimonio se traza al entrar y marca donde estas hoy.',
      'mejor: Las pantallas vacias tienen ilustracion propia en vez de un icono gris.',
      'mejor: La cuenta ya viene puesta. La app recuerda de cual pagaste la ultima vez, y la puedes cambiar igual.',
      'nuevo: Repetir el ultimo movimiento de un toque, sin esperar a que se vuelva un habito.',
      'arreglo: ! Si tenias mas de 24 categorias, las demas no aparecian al anotar y no se podian elegir.',
      'arreglo: ! El impuesto del 0.15% se sumaba tambien a los ingresos, inflando cada uno. Ya no, y Salud de datos ofrece corregir los que quedaron mal.',
      'arreglo: ! La descripcion de un gasto no se guardaba nunca, ni al crearla ni al editarla. Ya se guarda, y se ve al tocar el movimiento.',
      'arreglo: ! En la ficha de una tarjeta, el cupo salia aplastado en una tira con el texto cortado por la mitad.',
      'nuevo: Visa, Mastercard y las demas ya se marcan en TODAS tus tarjetas, no solo en las de credito.',
      'mejor: La marca se ve bien sobre cualquier color de tarjeta, y tambien aparece en la vista de lista.',
      'arreglo: ! Con cantidades grandes, el balance del resumen salia cortado ("RD$ 1,166,62..."). Ahora la cifra siempre se ve entera.',
      'mejor: En ingles, las pantallas de PIN y patron y varios avisos seguian saliendo en español. Ya no.',
    ],
  },
  {
    version: '1.9.10',
    date: '2026-09-24',
    title: 'Vuelve a estar en mas dispositivos',
    items: [
      'arreglo: La 1.9.9 dejo de estar disponible en 27 aparatos (de coche, TVs y algunas tablets) por como se bloqueo la pantalla en vertical. Vuelven a poder instalarla, y la app sigue sin girar.',
      'arreglo: ! La descripcion de una transferencia no se guardaba. La escribias y desaparecia sin avisar.',
      'mejor: El boton de descripcion ya no cambia de sitio segun el telefono.',
      'mejor: Lo que debes en una tarjeta vuelve al rosa de antes, con mas brillo.',
      'mejor: La ventana de novedades ya no corta el texto de golpe abajo.',
    ],
  },
  {
    version: '1.9.9',
    date: '2026-09-16',
    title: 'Detalles que molestaban',
    items: [
      'nuevo: En Salud de datos puedes marcar un descuadre como revisado. Si la diferencia cambia, vuelve a avisarte.',
      'nuevo: Puedes recalcular una sola cuenta o una sola meta, sin tocar las demas.',
      'nuevo: Salud de datos guarda un historial de lo que se recalculo, con cuanto se movio, y deja deshacerlo.',
      'nuevo: Los puntos de recuperacion ya se pueden restaurar. Estaban guardandose, pero no habia forma de usarlos.',
      'arreglo: Cuando una meta de ahorro no cuadraba, Salud de datos avisaba pero no decia cual era. Ahora la nombra.',
      'mejor: Esta pantalla de novedades. Ahora se ve la version nueva y las anteriores quedan a un toque.',
      'nuevo: En el conversor, un boton de Estadisticas: como se ha movido esa moneda, con grafica.',
      'arreglo: ! Ajustes > Notificaciones se veia rota, cubierta de azul. Ya esta.',
      'arreglo: ! En Movimientos, al mantener pulsado se asomaban las acciones ocultas y se pulsaban sin querer. Ahora solo salen al deslizar.',
      'mejor: Cuentas ya no repite el patrimonio neto arriba. Se entra a ver las cuentas, y ahora estan lo primero.',
      'arreglo: ! La pantalla ya no gira. La app es vertical, y en horizontal se veia rota.',
      'arreglo: Lo que debes en una tarjeta se veia en un rosa palido que se perdia con el color de la tarjeta. Ahora es rojo y se lee sobre cualquiera.',
      'arreglo: En Cuentas, deslizar las tarjetas movia tambien la pantalla de lado.',
    ],
  },
  {
    version: '1.9.8',
    date: '2026-09-05',
    title: 'Tus cuentas, como se ven de verdad',
    items: [
      'nuevo: Cuentas se rediseno entero. Tu efectivo se ve como un billete y tus tarjetas como tarjetas.',
      'nuevo: Debito y ahorro tambien son tarjetas ahora, agrupadas por tipo y con el total de cada grupo.',
      'nuevo: Elige como verlas: en carrusel o en lista.',
      'nuevo: "Valorar Cuadre" en Ajustes, con estrellas y enlace directo a Google Play.',
      'nuevo: Ya puedes elegir que avisos quieres recibir, uno por uno.',
      'nuevo: La app suma el impuesto del 0.15% a los gastos pagados desde el banco. Se puede apagar en Ajustes.',
      'mejor: Una tarjeta con deuda en pesos y en dolares ahora muestra las dos.',
      'mejor: Cada cuenta muestra su propia moneda, con el equivalente debajo si es extranjera.',
      'mejor: Los temas tienen cara: icono, nombre y una vista previa real. Oceano, Atardecer y Bosque son mas profundos.',
      'mejor: Las notificaciones dentro de la app se ven mejor y se pueden filtrar.',
      'mejor: Los archivos que exportas ya se llaman "cuadre-".',
      'mejor: Se quitaron los widgets de Saldo, Presupuestos y Conversor. Queda el de "+", que es el que se usa.',
      'arreglo: ! El modo privado no tapaba todos los montos.',
      'arreglo: ! Al elegir un tema nuevo, volvia al anterior al reabrir la app.',
      'arreglo: Al crear tu primera tarjeta de credito no se pedia el cupo, ni si el monto era lo que debes o lo que te queda.',
      'arreglo: Se retiro el tema Arena.',
    ],
  },
  {
    version: '1.9.7',
    date: '2026-08-27',
    title: 'Se actualiza sola, y detecta de verdad',
    items: [
      'nuevo: Cuando salga una version nueva, la app te avisa y se actualiza sola, sin mandarte a la tienda.',
      'nuevo: Puedes anadirle una descripcion a un gasto: con quien fuiste, que incluia, el numero de factura. Es opcional.',
      'nuevo: Al tocar un movimiento se ve todo: su descripcion, los cargos del banco por separado y si se repite.',
      'nuevo: Las listas de compra recuerdan los precios. Escribes "pollo" y entra con lo que pagaste la ultima vez.',
      'nuevo: Ponle un tope a una lista: "voy al super con 3.000" y la app te dice si te alcanza antes de salir de casa.',
      'mejor: Las tarjetas de credito muestran lo que tienes disponible y su deuda en las dos monedas.',
      'mejor: Deudas se rediseno: se ve de que esta hecha tu deuda, y lo que te deben se distingue de lo que debes.',
      'arreglo: ! El aviso de nueva version llevaba mucho tiempo sin aparecer. Ya funciona.',
      'mejor: Las listas se ven mejor: cada una lleva su color de verdad y las terminadas se distinguen solas.',
      'nuevo: Modo privado: tapa todos los montos de un toque, para cuando alguien puede ver tu pantalla.',
      'nuevo: Cuatro temas nuevos: Oceano, Atardecer, Bosque y Arena (claro y calido).',
      'mejor: El patrimonio neto ahora cuenta tus deudas registradas y el dinero que te deben. Antes solo miraba las cuentas.',
      'mejor: En Suscripciones, las sugerencias salen de tres en tres y se pueden descartar todas de una vez.',
      'arreglo: ! La deteccion de transacciones decia que estaba activa y no detectaba nada. Ya funciona.',
      'mejor: Los widgets siguen el tema del sistema y toman los colores de tu fondo de pantalla.',
    ],
  },
  {
    version: '1.9.6',
    date: '2026-08-19',
    title: 'Tus deudas, en condiciones',
    items: [
      'nuevo: Las deudas se registran completas: dia de pago, hasta cuando duran, a quien le debes y de que tipo son. La app te dice cuantas cuotas faltan y avisa antes del vencimiento.',
      'nuevo: Si pones hasta cuando dura la deuda, la app calcula sola la cuota que te liquida en ese plazo.',
      'nuevo: Historial de pagos de cada deuda, y ya puedes apuntar el dinero que TE DEBEN.',
      'nuevo: Guia para que Android no duerma la app, con los pasos de tu marca. Si la duerme, deja de registrar tus movimientos sin avisarte.',
      'nuevo: Si tienes una tarjeta con el disponible escrito donde va la deuda, la app te lo pregunta y lo corrige en un toque.',
      'nuevo: Al escribir el concepto te aparece lo que ya habias puesto antes, empezando por la categoria en la que estas.',
      'mejor: Al escribir, el campo se queda pegado al teclado. En el selector de cuentas cada tarjeta muestra sus ultimos 4 digitos.',
      'mejor: En una tarjeta con movimientos, la deuda ya no se teclea: la mueven tus gastos y pagos. Para cuadrarla con el banco esta "Conciliar saldo".',
      'arreglo: ! Pagar una deuda no descontaba el dinero de ninguna cuenta. Ahora todo pago sale de una cuenta que tu eliges.',
      'arreglo: ! Un movimiento podia borrarse solo al reabrir la app, y la deuda en dolares de una tarjeta desaparecia al recalcular.',
      'arreglo: El ajuste de sobregiro no hacia nada. Ahora avisa de verdad y se llama "Saldo en negativo".',
      'arreglo: "Ocultar centavos" no funcionaba, y "Tu semana" mostraba los montos sin centavos aunque los tuvieras activados.',
      'mejor: La app ya no envia nada a ningun servidor: tus datos financieros no salen del telefono.',
    ],
  },
  {
    version: '1.9.5',
    date: '2026-08-07',
    title: 'Tu tarjeta, como la lee tu banco',
    items: [
      'arreglo: ! Una tarjeta con el disponible escrito en el saldo salia como si no se hubiera usado: el cupo entero libre y el boton de pagar ofreciendo cero.',
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
    date: '2026-07-31',
    title: 'Las tarjetas, cuadrando de verdad',
    items: [
      'arreglo: ! en una tarjeta de credito, el saldo que escribias se guardaba al reves: tecleabas lo que debias y la app entendia que el banco te debia a ti. La tarjeta decia "no debes nada" y el boton de pagar ofrecia RD$ 0.00.',
      'arreglo: ! al editar una cuenta, "Detalles" se recortaba solo y dejaba visible una sola fila: no se podia cambiar ni el limite, ni el banco, ni el ciclo, ni nada.',
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
    date: '2026-07-20',
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
    date: '2026-07-09',
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
      'arreglo: ! la deuda en dolares no contaba en tu patrimonio.',
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
    date: '2026-07-02',
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
    date: '2026-05-28',
    title: 'UX profesional completa',
    items: [
      'Dialogos propios para confirmaciones destructivas.',
      'Filtro guardado con modal de texto propio.',
      'Cero dialogos nativos del navegador en flujos de usuario.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-05-19',
    title: 'Calidad de datos y recuperacion',
    items: [
      'Snapshot automatico antes de restaurar backups.',
      'Estado de datos visible en Configuracion.',
      'Pruebas de fixtures legacy, backups corruptos y restauracion segura.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-06',
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
    date: '2026-04-27',
    title: 'Reportes y decision financiera',
    items: [
      'Sensibilidad configurable para gastos atipicos.',
      'Suscripciones detectadas convertibles en recurrencias mensuales.',
      'Resumen ejecutivo para Excel y PDF mensual.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-04-15',
    title: 'CSV bancario dominicano',
    items: [
      'Perfiles para bancos y tarjetas principales.',
      'Vista previa con mapeo manual y conciliacion flexible.',
    ],
  },
]
