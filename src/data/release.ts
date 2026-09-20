/** Versión actual de la app, leída de package.json en build time — siempre
 *  coincide con la versión que se sube a la tienda, sin pasos manuales. */
export const APP_VERSION = __APP_VERSION__

export interface ReleaseNote {
  version: string
  date: string
  title: string
  items: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
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
