import {
  RECEIPT_QUALITY, dataUrlBytes, isStorableReceipt, scaledDimensions,
} from '@/data/receiptImage'

/**
 * Las fotos de recibo, en IndexedDB.
 *
 * NO en `localStorage`: ahí vive el libro entero, con un tope de unos pocos
 * megas, y veinte recibos lo llenarían dejando a la app sin poder guardar ni
 * un gasto más. El razonamiento largo está en `data/receiptImage.ts`.
 *
 * Todo lo de aquí FALLA EN SILENCIO y devuelve `null`. Es deliberado: el
 * recibo es un extra sobre el movimiento, nunca el movimiento. Si IndexedDB
 * no está disponible (modo privado, almacenamiento bloqueado, cuota llena),
 * lo que tiene que pasar es que se guarde el gasto sin foto — jamás que se
 * pierda el gasto por culpa de una foto.
 */

const DB_NAME = 'cuadre-receipts'
const DB_VERSION = 1
const STORE = 'receipts'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      // Otra pestaña con la base abierta bloqueando la migración: no se espera
      // indefinidamente, se sigue sin recibos.
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(db => {
    if (!db) return null
    return new Promise<T | null>(resolve => {
      try {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => resolve(null)
        tx.onabort = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  })
}

/**
 * Encoge la foto antes de guardarla.
 *
 * La foto de un teléfono de hoy ronda los 4000 px y cuatro megas. Un recibo
 * solo tiene que poder LEERSE en pantalla, así que se redibuja a 1400 px de
 * lado mayor en JPEG — unos 200 KB. Si algo falla por el camino se devuelve
 * `null` y el movimiento se guarda sin foto.
 */
export function compressReceipt(dataUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight)
          if (!width || !height) { resolve(null); return }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(null); return }
          ctx.drawImage(img, 0, 0, width, height)
          const salida = canvas.toDataURL('image/jpeg', RECEIPT_QUALITY)
          // Comprimir puede salir PEOR que el original (una captura pequeña y
          // plana en PNG, por ejemplo). En ese caso se queda el original.
          const mejor = dataUrlBytes(salida) < dataUrlBytes(dataUrl) ? salida : dataUrl
          resolve(isStorableReceipt(mejor) ? mejor : null)
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    } catch {
      resolve(null)
    }
  })
}

/** Guarda la foto de un movimiento. Devuelve si se pudo. */
export async function putReceipt(txId: string, dataUrl: string): Promise<boolean> {
  if (!isStorableReceipt(dataUrl)) return false
  const ok = await run('readwrite', store => store.put(dataUrl, txId))
  // `put` resuelve con la clave; `null` es el fallo.
  return ok !== null
}

/** La foto de un movimiento, o `null` si no tiene o no se pudo leer. */
export async function getReceipt(txId: string): Promise<string | null> {
  const value = await run<unknown>('readonly', store => store.get(txId) as IDBRequest<unknown>)
  return typeof value === 'string' && value.startsWith('data:image/') ? value : null
}

/**
 * Borra la foto de un movimiento.
 *
 * Se llama al borrar el movimiento DE VERDAD, no al mandarlo a la papelera:
 * si se borrara antes, recuperarlo a los veinte días devolvería un movimiento
 * sin su recibo, que es justo la mitad que hacía falta.
 */
export async function deleteReceipt(txId: string): Promise<void> {
  await run('readwrite', store => store.delete(txId) as unknown as IDBRequest<undefined>)
}

/** Las claves guardadas, para poder limpiar las huérfanas. */
export async function listReceiptIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', store => store.getAllKeys())
  return (keys ?? []).filter((k): k is string => typeof k === 'string')
}

/**
 * Tira las fotos cuyo movimiento ya no existe.
 *
 * Hace falta porque el libro se puede reemplazar entero por detrás —al
 * restaurar una copia de seguridad, que NO trae fotos— y entonces quedan
 * imágenes apuntando a movimientos que ya no están. Sin esto, se acumularían
 * para siempre sin que nada las nombre.
 */
export async function pruneOrphanReceipts(liveTxIds: Set<string>): Promise<number> {
  const ids = await listReceiptIds()
  const huerfanas = ids.filter(id => !liveTxIds.has(id))
  for (const id of huerfanas) await deleteReceipt(id)
  return huerfanas.length
}
