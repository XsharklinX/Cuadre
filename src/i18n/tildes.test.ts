import { describe, expect, it } from 'vitest'
import { I18N_DICTS } from './index'

/**
 * GUARDIA: los textos en español llevan sus tildes.
 *
 * ── POR QUÉ HACE FALTA UN TEST PARA ESTO ──────────────────────────────
 * La app se escribió a ratos y con prisa, y casi cien textos quedaron sin
 * tilde: «Dia de corte», «Pago minimo», «{y} anos y {m} meses». No es
 * cosmético — «anos» no significa «años», y un «Cuanto debes» sin tilde es
 * otra palabra. El usuario es dominicano y la mitad de sus usuarios ven la app
 * en español: es el idioma en el que la app se lee, no una traducción.
 *
 * Ni TypeScript ni la auditoría de paridad ven esto: una palabra sin tilde es
 * una cadena perfectamente válida con las mismas claves y los mismos
 * placeholders.
 *
 * ── QUÉ NO VIGILA, A PROPÓSITO ────────────────────────────────────────
 * `solo` (la RAE ya no le pone tilde), `periodo` (válida con y sin), y
 * `esta`, `como`, `cuando`, `donde`, `que`: según la frase son demostrativo o
 * verbo, conjunción o interrogativo, y una regla mecánica se equivocaría.
 * Tampoco `intento` ni `cambio`, que son sustantivos tanto como verbos — un
 * primer intento de corregirlos a ciegas escribió «El último intentó falló».
 */

/** Palabra sin tilde → como se escribe. Solo casos sin ambigüedad. */
const FALTAN: Record<string, string> = {
  // -ción / -sión
  version: 'versión', informacion: 'información', configuracion: 'configuración',
  notificacion: 'notificación', aplicacion: 'aplicación', valoracion: 'valoración',
  ejecucion: 'ejecución', recuperacion: 'recuperación', actualizacion: 'actualización',
  deteccion: 'detección', descripcion: 'descripción', seleccion: 'selección',
  conexion: 'conexión', exportacion: 'exportación', importacion: 'importación',
  reconciliacion: 'reconciliación', validacion: 'validación', verificacion: 'verificación',
  suscripcion: 'suscripción', transaccion: 'transacción', division: 'división',
  sesion: 'sesión', opcion: 'opción', accion: 'acción', direccion: 'dirección',
  revision: 'revisión', razon: 'razón', proyeccion: 'proyección',
  // Sustantivos y adjetivos
  categoria: 'categoría', categorias: 'categorías', dia: 'día', dias: 'días',
  telefono: 'teléfono', numero: 'número', numeros: 'números', bateria: 'batería',
  grafica: 'gráfica', graficas: 'gráficas', linea: 'línea', lineas: 'líneas',
  plastico: 'plástico', dialogo: 'diálogo', credito: 'crédito', debito: 'débito',
  deposito: 'depósito', prestamo: 'préstamo', interes: 'interés', limite: 'límite',
  limites: 'límites', minimo: 'mínimo', maximo: 'máximo', titulo: 'título',
  codigo: 'código', alcancia: 'alcancía', pais: 'país', anos: 'años',
  manana: 'mañana', vacia: 'vacía', vacio: 'vacío', ambar: 'ámbar', trio: 'trío',
  camara: 'cámara', analisis: 'análisis', arbol: 'árbol', margenes: 'márgenes',
  ultimo: 'último', ultima: 'última', ultimos: 'últimos', ultimas: 'últimas',
  proximo: 'próximo', proxima: 'próxima', automatico: 'automático',
  automatica: 'automática', facil: 'fácil', dificil: 'difícil', util: 'útil',
  inutil: 'inútil', movil: 'móvil', recien: 'recién', unico: 'único', unica: 'única',
  // Adverbios y conectores
  tambien: 'también', despues: 'después', segun: 'según', aqui: 'aquí',
  asi: 'así', mas: 'más', quiza: 'quizá', ningun: 'ningún', algun: 'algún',
  cuanto: 'cuánto', cuantos: 'cuántos', cuanta: 'cuánta',
  // Verbos en pasado, futuro y condicional
  solto: 'soltó', quedo: 'quedó', sera: 'será', seran: 'serán', estan: 'están',
  estaras: 'estarás', podras: 'podrás', veras: 'verás', apareceran: 'aparecerán',
  aparecera: 'aparecerá', contara: 'contará', propondra: 'propondrá',
  deberia: 'debería', diria: 'diría', podria: 'podría', tendras: 'tendrás',
  habra: 'habrá', cuentalo: 'cuéntalo', anadir: 'añadir',
}

/** Un `{placeholder}` no es español: `{version}` es un nombre, no una palabra. */
function sinHuecos(texto: string): string {
  return texto.replace(/\{[a-zA-Z0-9_]+\}/g, ' ')
}

const PALABRA = /[A-Za-zÀ-ÿ]+/g

describe('los textos en español llevan sus tildes', () => {
  it('ninguna palabra conocida aparece sin su tilde', () => {
    const fallos: string[] = []

    for (const [clave, valor] of Object.entries(I18N_DICTS.es)) {
      for (const palabra of sinHuecos(String(valor)).match(PALABRA) ?? []) {
        const bien = FALTAN[palabra.toLowerCase()]
        if (bien) fallos.push(`es.${clave}: "${palabra}" → "${bien}"  (${valor})`)
      }
    }

    expect(fallos, `Faltan tildes:\n${fallos.join('\n')}`).toEqual([])
  })

  it('la lista de palabras vigiladas no se contradice', () => {
    // Una entrada cuyo valor fuera igual a su clave no corregiría nada y
    // haría que el test nunca pudiera pasar.
    for (const [mal, bien] of Object.entries(FALTAN)) {
      expect(bien, mal).not.toBe(mal)
    }
  })

  it('ninguna palabra vigilada es una ambigüedad conocida', () => {
    // Si alguien añadiera `esta` o `solo` aquí, el test exigiría escribir mal
    // la mitad de la app. Queda anotado para que no pase.
    const AMBIGUAS = ['solo', 'periodo', 'esta', 'estas', 'como', 'cuando',
      'donde', 'quien', 'que', 'intento', 'cambio', 'publico', 'termino']
    for (const palabra of AMBIGUAS) {
      expect(FALTAN, palabra).not.toHaveProperty(palabra)
    }
  })
})
