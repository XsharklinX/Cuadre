import { reconcileBusinessData, type RestoreReport } from '@/data/restoreBusiness'
import type { FinanceBackup } from '@/data/backup'
import { sanitizeBusinessData, useBusiness } from '@/store/business'
import { sanitizeCaprices, useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useNotes } from '@/store/notes'

/**
 * RESTAURAR, POR UN SOLO SITIO.
 *
 * ── POR QUÉ ESTO EXISTE ───────────────────────────────────────────────
 * Hay TRES caminos para restaurar datos en la app, y los tres llamaban a
 * `restoreBackup` por su cuenta:
 *
 *  1. Ajustes → Datos → Restaurar copia
 *  2. Salud de datos → un punto de recuperación
 *  3. Importar por QR desde otro teléfono
 *
 * Arreglé el primero y me dejé los otros dos, que es exactamente el fallo que
 * esta función impide: una regla aplicada en tres sitios se acaba aplicando en
 * dos. Los puntos de recuperación son los peores de olvidar, porque la app los
 * crea sola antes de cada operación destructiva — son la red de seguridad, y
 * usarla no puede costarte los clientes.
 *
 * Reemplaza el libro, las listas y los datos de negocio de una vez, y
 * reconcilia lo que quedó sin pareja en vez de dejar que las limpiezas del
 * arranque lo borren por huérfano. Devuelve lo que cambió, para poder decirlo.
 */
export function restoreEverything(data: FinanceBackup['data']): RestoreReport {
  useFinance.getState().restoreBackup(data)
  useNotes.getState().importNotes(data.notes ?? [])

  /*
   * El libro MANDA: la reconciliación se hace contra `data.transactions`, que
   * es lo que acaba de entrar, no contra lo que había. Usar el estado anterior
   * dejaría cobros apuntando al libro viejo.
   */
  /*
   * Se SANEA con el validador del almacen antes de reconciliar.
   *
   * El esquema de la copia es permisivo a proposito con estos datos —rechazar
   * la copia entera por un campo de un cliente costaria al usuario sus
   * movimientos—, asi que lo que sale de ahi puede traer cualquier cosa. El
   * saneador del almacen es el que decide la forma final, y es el mismo que
   * corre al cargar la app: una sola verdad sobre que es un cliente valido.
   */
  const saneado = sanitizeBusinessData({
    clients: data.clients, businesses: data.businesses,
    services: data.services, charges: data.charges,
  })
  const { data: negocio, report } = reconcileBusinessData(
    { ...saneado, caprices: sanitizeCaprices(data.caprices) },
    data.transactions,
  )

  useBusiness.setState({
    clients: negocio.clients,
    businesses: negocio.businesses,
    services: negocio.services,
    charges: negocio.charges,
  })
  useCaprices.setState({ items: negocio.caprices })

  return report
}

/**
 * Las frases del informe, ya traducidas, o vacío si no hubo nada que contar.
 *
 * Separado de la restauración para que esta no necesite saber de traducciones
 * ni de avisos: devolver el informe y decidir aparte cómo contarlo deja los
 * tres caminos libres de enseñarlo como les convenga.
 */
export function restoreReportLines(
  report: RestoreReport,
  t: (key: 'restoreChargesUnlinked' | 'restoreCapricesDropped' | 'restoreChargesOrphaned') => string,
): string[] {
  const lineas: string[] = []
  if (report.chargesUnlinked > 0) {
    lineas.push(t('restoreChargesUnlinked').replace('{n}', String(report.chargesUnlinked)))
  }
  if (report.capricesDropped > 0) {
    lineas.push(t('restoreCapricesDropped').replace('{n}', String(report.capricesDropped)))
  }
  if (report.chargesOrphaned > 0) {
    lineas.push(t('restoreChargesOrphaned').replace('{n}', String(report.chargesOrphaned)))
  }
  return lineas
}
