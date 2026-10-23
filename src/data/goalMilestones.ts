/**
 * LOS HITOS DE LA META, NO SOLO EL FINAL.
 *
 * El sonido de logro de la app sonaba en UN solo sitio en todo el programa: al
 * llegar al 100 % de una meta. Una meta de RD$ 100,000 tarda meses, y en todo
 * ese camino la app no decía absolutamente nada — justo donde el ahorro se
 * hace largo y se abandona.
 *
 * Los hitos reparten la recompensa por el medio. Y se calculan por CRUCE, no
 * por estado: solo se celebra el hito que este aporte acaba de pasar, así que
 * volver a abrir la meta no vuelve a celebrar nada y quitar dinero y volver a
 * ponerlo no celebra dos veces (eso lo decide quien llama, guardando el hito).
 */

/** Los cuatro puntos del camino, en porcentaje. */
export const GOAL_MILESTONES = [25, 50, 75, 100] as const

export type GoalMilestone = (typeof GOAL_MILESTONES)[number]

/**
 * Qué hitos cruza un aporte.
 *
 * @param before ahorro antes del aporte
 * @param after  ahorro después del aporte
 * @param target objetivo de la meta
 * @returns los hitos cruzados, de menor a mayor. Vacío si no cruza ninguno.
 */
export function crossedMilestones(before: number, after: number, target: number): GoalMilestone[] {
  // Una meta sin objetivo no tiene camino que repartir: dividir por cero daría
  // Infinity y celebraría los cuatro hitos de golpe con el primer peso.
  if (!(target > 0)) return []
  // Un aporte que resta (una corrección) no celebra nada, aunque al bajar
  // «cruce» los hitos en sentido contrario.
  if (after <= before) return []

  return GOAL_MILESTONES.filter(pct => {
    const umbral = (target * pct) / 100
    return before < umbral && after >= umbral
  })
}

/**
 * El hito más alto que cruza un aporte, que es el único que se celebra.
 *
 * Un primer aporte de golpe puede cruzar los cuatro a la vez; encadenar cuatro
 * celebraciones sería ruido. Se celebra el techo alcanzado.
 */
export function topCrossedMilestone(before: number, after: number, target: number): GoalMilestone | null {
  const cruzados = crossedMilestones(before, after, target)
  return cruzados.length ? cruzados[cruzados.length - 1] : null
}

/** Clave con la que se recuerda que un hito ya se celebró. */
export function milestoneAlertId(goalId: string, pct: number): string {
  return `goal-ms-${goalId}-${pct}`
}
