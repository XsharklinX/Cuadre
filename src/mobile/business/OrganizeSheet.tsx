import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { BrandTile } from '@/components/ui/BrandTile'
import { useT } from '@/i18n'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { BizSheet } from './shared'

/**
 * ORGANIZAR: ORDENAR A MANO Y ARCHIVAR LO QUE YA NO VA.
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────
 * Los negocios salían en el orden en que los creaste, que no es el orden en
 * que los miras. Y un negocio terminado solo se podía borrar, perdiendo con
 * él un trimestre de datos reales.
 *
 * ── SE ARRASTRA Y TAMBIÉN SE PULSA ────────────────────────────────────
 * Arrastrar es el gesto natural, pero deja fuera a quien usa la app con
 * lector de pantalla o con el pulgar torpe en el autobús. Los dos caminos
 * llevan al mismo sitio y ninguno es el de segunda: los botones de subir y
 * bajar están siempre visibles, no escondidos detrás del arrastre.
 */
export function OrganizeSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { businesses, reorderBusinesses, archiveBusiness } = useBusiness()

  // Se trabaja sobre una copia y se guarda al cerrar: reordenar en el store a
  // cada movimiento del dedo repintaría la pantalla de debajo veinte veces.
  const [orden, setOrden] = useState(() => businesses.map(b => b.id))
  const arrastrando = useRef<string | null>(null)

  const lista = orden
    .map(id => businesses.find(b => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b)

  const mover = (id: string, paso: number) => {
    setOrden(prev => {
      const i = prev.indexOf(id)
      const j = i + paso
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const copia = [...prev]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
    playSoftHaptic()
  }

  /** Al cruzar la mitad de un vecino, se cambian el sitio. */
  const alArrastrar = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (arrastrando.current !== id) return
    const fila = (e.currentTarget as HTMLElement)
    const caja = fila.getBoundingClientRect()
    const centro = caja.top + caja.height / 2
    if (e.clientY < centro - caja.height * 0.6) mover(id, -1)
    else if (e.clientY > centro + caja.height * 0.6) mover(id, 1)
  }

  const guardar = () => {
    reorderBusinesses(orden)
    toast(t('bizReorderDone'), { icon: 'check', type: 'ok' })
    onClose()
  }

  return (
    <BizSheet title={t('bizReorder')} onClose={onClose} onSave={guardar}>
      <p className="mbizs-calc">{t('bizArchiveHint')}</p>

      <div className="morg-list">
        {lista.map((biz, i) => (
          <div
            key={biz.id}
            className={`morg-row${biz.archivedAt ? ' off' : ''}`}
            onPointerDown={() => { arrastrando.current = biz.id }}
            onPointerMove={e => alArrastrar(e, biz.id)}
            onPointerUp={() => { arrastrando.current = null }}
            onPointerCancel={() => { arrastrando.current = null }}
          >
            <span className="morg-grip" aria-hidden="true"><Icon name="dots" size={16} /></span>
            <BrandTile name={biz.name} size={26} color={biz.color} icon={biz.icon} />
            <span className="morg-id">
              <b>{biz.name}</b>
              {biz.archivedAt && <small>{t('bizArchived')}</small>}
            </span>

            {/* Los dos botones, siempre visibles: no son el camino de
                segunda, son el otro camino. */}
            <button
              className="morg-btn"
              aria-label={t('bizUp')}
              disabled={i === 0}
              onClick={() => mover(biz.id, -1)}
            >
              <Icon name="arrowUp" size={14} />
            </button>
            <button
              className="morg-btn"
              aria-label={t('bizDown')}
              disabled={i === lista.length - 1}
              onClick={() => mover(biz.id, 1)}
            >
              <Icon name="arrowDn" size={14} />
            </button>
            <button
              className={`morg-btn${biz.archivedAt ? ' on' : ''}`}
              aria-label={t(biz.archivedAt ? 'bizUnarchive' : 'bizArchive')}
              aria-pressed={!!biz.archivedAt}
              onClick={() => {
                const archivar = !biz.archivedAt
                archiveBusiness(biz.id, archivar)
                playSoftHaptic()
                if (archivar) {
                  toast(t('bizArchiveDone').replace('{name}', biz.name), { icon: 'check', type: 'ok' })
                }
              }}
            >
              <Icon name="package" size={14} />
            </button>
          </div>
        ))}
      </div>
    </BizSheet>
  )
}
