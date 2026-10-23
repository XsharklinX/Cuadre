/**
 * ILUSTRACIONES PARA LAS PANTALLAS VACÍAS.
 *
 * Quien instala la app ve varias de estas seguidas —sin movimientos, sin
 * presupuestos, sin metas— y es justo el momento en que decide si le compensa.
 * Antes eran un icono gris dentro de un círculo: correcto y olvidable.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁN HECHAS CON LAS FORMAS DEL ICONO
 *
 * El icono de Cuadre son dos tarjetas superpuestas. Repetir ese vocabulario
 * aquí hace que la pantalla vacía se lea como parte de la app y no como un
 * dibujo comprado: misma geometría, mismo canto iluminado arriba, misma
 * sombra de contacto debajo.
 *
 * Y los colores salen de los tokens del tema, no de valores fijos: alguien con
 * el tema Atardecer no debería encontrarse una ilustración verde azulada en
 * medio de su app.
 */

export type EmptyArtKind = 'movements' | 'budgets' | 'goals' | 'clients' | 'business' | 'caprices'

/**
 * El canto iluminado arriba y el oscuro abajo — lo mismo que da grosor a las
 * tarjetas de la app y al icono. Se declara una vez y lo usan los tres.
 */
function Filo({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".5" />
      <stop offset=".5" stopColor="#fff" stopOpacity=".05" />
      <stop offset="1" stopColor="#000" stopOpacity=".2" />
    </linearGradient>
  )
}

export function EmptyArt({ kind, size = 108 }: { kind: EmptyArtKind; size?: number }) {
  // La sombra de contacto va en todas: es lo que apoya el dibujo sobre la
  // pantalla en vez de dejarlo flotando.
  const suelo = <ellipse cx="60" cy="88" rx="34" ry="5" fill="var(--m-primary)" opacity=".12" />

  if (kind === 'budgets') {
    return (
      <svg viewBox="0 0 120 96" width={size} height={size * 0.8} role="img" aria-hidden="true">
        <defs><Filo id="ea-f1" /></defs>
        {suelo}
        {/* Un sobre: es la metáfora que ya usa la app para los presupuestos. */}
        <rect x="22" y="32" width="76" height="48" rx="9" fill="var(--m-surface-2)" />
        <rect x="27" y="24" width="66" height="42" rx="8" fill="var(--m-income)" />
        <rect x="27" y="24" width="66" height="42" rx="8" fill="url(#ea-f1)" />
        <path d="M27 32 L60 54 L93 32" fill="none" stroke="var(--m-bg)" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
        {/* La moneda que entra: dice qué se hace con el sobre. */}
        <circle cx="88" cy="22" r="10" fill="var(--m-primary)" />
        <circle cx="88" cy="22" r="10" fill="url(#ea-f1)" />
      </svg>
    )
  }

  if (kind === 'clients') {
    return (
      <svg viewBox="0 0 120 96" width={size} height={size * 0.8} role="img" aria-hidden="true">
        <defs><Filo id="ea-f4" /></defs>
        {suelo}
        {/* Tres fichas de pie, como las de la lista de clientes, con su
            cabecita: es gente, no cuentas. La del medio adelantada repite el
            apilado del icono. */}
        <rect x="16" y="46" width="30" height="34" rx="8" fill="var(--m-surface-2)" />
        <rect x="16" y="46" width="30" height="34" rx="8" fill="url(#ea-f4)" />
        <circle cx="31" cy="40" r="8" fill="var(--m-muted)" opacity=".55" />

        <rect x="74" y="46" width="30" height="34" rx="8" fill="var(--m-surface-2)" />
        <rect x="74" y="46" width="30" height="34" rx="8" fill="url(#ea-f4)" />
        <circle cx="89" cy="40" r="8" fill="var(--m-muted)" opacity=".55" />

        <rect x="44" y="40" width="32" height="40" rx="9" fill="var(--m-income)" />
        <rect x="44" y="40" width="32" height="40" rx="9" fill="url(#ea-f4)" />
        <circle cx="60" cy="32" r="9" fill="var(--m-income)" />
        <circle cx="60" cy="32" r="9" fill="url(#ea-f4)" />
      </svg>
    )
  }

  if (kind === 'business') {
    return (
      <svg viewBox="0 0 120 96" width={size} height={size * 0.8} role="img" aria-hidden="true">
        <defs><Filo id="ea-f5" /></defs>
        {suelo}
        {/* Un mostrador con su toldo: lo mas corto para decir «negocio» sin
            caer en un maletin, que dice «oficina» y no es el caso de nadie que
            revenda cuentas o de clases. */}
        <rect x="24" y="44" width="72" height="36" rx="8" fill="var(--m-surface-2)" />
        <rect x="24" y="44" width="72" height="36" rx="8" fill="url(#ea-f5)" />
        <path d="M18 44 L30 26 L90 26 L102 44 Z" fill="var(--m-primary)" />
        <path d="M18 44 L30 26 L90 26 L102 44 Z" fill="url(#ea-f5)" />
        {/* Las barras del toldo, que es lo que lo hace reconocible. */}
        <path d="M42 26 L36 44 M60 26 L60 44 M78 26 L84 44" stroke="var(--m-bg)" strokeOpacity=".32" strokeWidth="3" />
        <rect x="50" y="58" width="20" height="22" rx="4" fill="var(--m-bg)" opacity=".35" />
      </svg>
    )
  }

  if (kind === 'caprices') {
    return (
      <svg viewBox="0 0 120 96" width={size} height={size * 0.8} role="img" aria-hidden="true">
        <defs><Filo id="ea-f6" /></defs>
        {suelo}
        {/* Un bote con una moneda cayendo. Medio lleno, no vacio: lo que esta
            pantalla premia es recuperar, y un bote vacio parece un reproche. */}
        <path d="M34 42 H86 L82 80 H38 Z" fill="var(--m-surface-2)" />
        <path d="M34 42 H86 L82 80 H38 Z" fill="url(#ea-f6)" />
        <path d="M37 60 H83 L82 80 H38 Z" fill="var(--m-income)" opacity=".8" />
        <rect x="30" y="36" width="60" height="8" rx="4" fill="var(--m-muted)" opacity=".5" />
        <circle cx="60" cy="20" r="9" fill="var(--m-primary)" />
        <circle cx="60" cy="20" r="9" fill="url(#ea-f6)" />
      </svg>
    )
  }

  if (kind === 'goals') {
    return (
      <svg viewBox="0 0 120 96" width={size} height={size * 0.8} role="img" aria-hidden="true">
        <defs><Filo id="ea-f2" /></defs>
        {suelo}
        {/* Una tarjeta de pie con una bandera: lo guardado y hacia dónde va. */}
        <rect x="30" y="38" width="60" height="42" rx="9" fill="var(--m-surface-2)" />
        <rect x="30" y="38" width="60" height="42" rx="9" fill="url(#ea-f2)" />
        {/* El relleno: cuánto se lleva ahorrado. */}
        <rect x="30" y="60" width="60" height="20" rx="9" fill="var(--m-income)" opacity=".85" />
        <rect x="38" y="46" width="24" height="5" rx="2.5" fill="var(--m-muted)" opacity=".5" />
        <path d="M84 38 L84 10" stroke="var(--m-muted)" strokeWidth="3" strokeLinecap="round" />
        <path d="M84 12 L104 18 L84 24 Z" fill="var(--m-primary)" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 120 96" width={size} height={size * 0.8} role="img" aria-hidden="true">
      <defs><Filo id="ea-f3" /></defs>
      {suelo}
      {/* Las dos tarjetas del icono, con las líneas de una lista encima: es
          literalmente lo que falta en esta pantalla. */}
      <g transform="rotate(-8 46 44)">
        <rect x="20" y="30" width="56" height="38" rx="9" fill="var(--m-primary)" opacity=".9" />
        <rect x="20" y="30" width="56" height="38" rx="9" fill="url(#ea-f3)" />
      </g>
      <g transform="rotate(6 72 52)">
        <rect x="46" y="38" width="56" height="38" rx="9" fill="#000" opacity=".2" />
        <rect x="46" y="34" width="56" height="38" rx="9" fill="var(--m-income)" />
        <rect x="46" y="34" width="56" height="38" rx="9" fill="url(#ea-f3)" />
        <rect x="54" y="46" width="30" height="4" rx="2" fill="var(--m-bg)" opacity=".45" />
        <rect x="54" y="55" width="20" height="4" rx="2" fill="var(--m-bg)" opacity=".3" />
      </g>
    </svg>
  )
}
