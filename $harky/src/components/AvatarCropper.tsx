import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { avatarBaseScale, avatarMaxOffset, cropAvatarPhoto } from '@/lib/avatarPhoto'

const MAX_ZOOM = 4
const VIEWPORT_MAX = 320

/**
 * Editor de encuadre para la foto de perfil: arrastrar para centrar, pellizcar
 * (o el deslizador) para acercar. El deslizador no es redundante con la pinza —
 * en pantallas pequeñas el gesto de dos dedos tapa justo la parte de la foto
 * que se está intentando encuadrar, y algunos WebView no entregan bien el
 * segundo puntero.
 *
 * El recuadro es cuadrado y la máscara circular solo indica cómo se verá: se
 * guarda el cuadrado completo para que la misma foto sirva si el avatar deja
 * de ser redondo en el futuro.
 */
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  /** Imagen a encuadrar: el `File` del input, o un data URL del selector nativo. */
  file: File | Blob | string
  onCancel: () => void
  onDone: (dataUrl: string) => void
}) {
  const t = useT()
  const stageRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewport, setViewport] = useState(VIEWPORT_MAX)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Se usa <img> y no createImageBitmap porque hace falta un elemento que el
  // canvas pueda dibujar Y que sirva de vista previa a la vez; ImageBitmap no
  // se puede mostrar en el DOM.
  useEffect(() => {
    const url = typeof file === 'string' ? file : URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setImage(img)
    img.onerror = () => setError(true)
    img.src = url
    return () => { if (typeof file !== 'string') URL.revokeObjectURL(url) }
  }, [file])

  // El visor se mide en vez de fijarse: los offsets se guardan en px del visor,
  // así que si el tamaño real no coincide con el asumido el recorte final sale
  // desplazado respecto a lo que el usuario veía.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setViewport(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [image])

  const clamp = (next: { x: number; y: number }, nextZoom: number) => {
    if (!image) return { x: 0, y: 0 }
    const max = avatarMaxOffset(image.width, image.height, { zoom: nextZoom, viewport })
    return {
      x: Math.max(-max.x, Math.min(max.x, next.x)),
      y: Math.max(-max.y, Math.min(max.y, next.y)),
    }
  }

  const applyZoom = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(MAX_ZOOM, nextZoom))
    setZoom(clamped)
    setOffset(current => clamp(current, clamped))
  }

  // Gestos con punteros: un dedo arrastra, dos pellizcan. Se registran a mano
  // (y no con eventos táctiles) para que el mismo código funcione con ratón en
  // la versión de escritorio.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance: number; zoom: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = null
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const previous = pointers.current.get(e.pointerId)
    if (!previous) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const points = [...pointers.current.values()]

    if (points.length >= 2) {
      const [a, b] = points
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (!gesture.current) gesture.current = { distance, zoom }
      else if (gesture.current.distance > 0) {
        applyZoom(gesture.current.zoom * (distance / gesture.current.distance))
      }
      return
    }

    setOffset(current => clamp({ x: current.x + (e.clientX - previous.x), y: current.y + (e.clientY - previous.y) }, zoom))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
  }

  const save = async () => {
    if (!image || saving) return
    setSaving(true)
    try {
      onDone(await cropAvatarPhoto(image, { zoom, offsetX: offset.x, offsetY: offset.y, viewport }))
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  const scale = image ? avatarBaseScale(image.width, image.height, viewport) * zoom : 1

  return (
    <div className="avc-overlay" role="dialog" aria-modal="true" aria-label={t('adjustPhotoTitle')}>
      <div className="avc-sheet">
        <div className="avc-head">
          <button className="avc-icon-btn" onClick={onCancel} aria-label={t('cancel')}>
            <Icon name="close" size={18} />
          </button>
          <h2>{t('adjustPhotoTitle')}</h2>
        </div>

        {error ? (
          <p className="avc-error">{t('photoUpdateError')}</p>
        ) : (
          <>
            <div
              ref={stageRef}
              className="avc-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {image && (
                <img
                  className="avc-img"
                  src={image.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: image.width * scale,
                    height: image.height * scale,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
              )}
              <div className="avc-mask" aria-hidden="true" />
            </div>

            <p className="avc-hint">{t('adjustPhotoHint')}</p>

            <div className="avc-zoom">
              <Icon name="search" size={14} />
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                aria-label={t('zoomLabel')}
                onChange={e => applyZoom(Number(e.target.value))}
              />
            </div>
          </>
        )}

        <div className="avc-actions">
          <button className="avc-btn avc-btn-ghost" onClick={onCancel}>{t('cancel')}</button>
          <button className="avc-btn avc-btn-primary" disabled={!image || saving || error} onClick={() => void save()}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
