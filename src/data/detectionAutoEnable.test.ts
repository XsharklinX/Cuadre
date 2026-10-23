import { describe, expect, it } from 'vitest'
import { shouldAutoEnableDetection } from './detectionAutoEnable'

/**
 * ENCENDER LA DETECCIÓN SOLA, Y SOLO CUANDO TOCA.
 *
 * El fallo que arregla: el usuario concedía el permiso especial de Android —la
 * parte difícil— y la detección seguía apagada porque el encendido automático
 * vivía dentro de Ajustes › Notificaciones. Quien no volvía a entrar a esa
 * pantalla no detectaba un solo movimiento, sin ningún error que lo explicara.
 *
 * Y el otro lado, igual de importante: apagarlo a propósito tiene que
 * respetarse, o la app le devolvería al usuario una decisión que él ya tomó.
 */

const caso = (over: Partial<Parameters<typeof shouldAutoEnableDetection>[0]> = {}) => ({
  granted: true, enabled: false, enabledSince: 0, ...over,
})

describe('encender la detección sola', () => {
  it('con el permiso concedido y sin haberla encendido nunca, se enciende', () => {
    expect(shouldAutoEnableDetection(caso())).toBe(true)
  })

  it('sin permiso no se enciende nada', () => {
    expect(shouldAutoEnableDetection(caso({ granted: false }))).toBe(false)
  })

  it('si ya está encendida, no hay nada que hacer', () => {
    expect(shouldAutoEnableDetection(caso({ enabled: true, enabledSince: 1 }))).toBe(false)
  })

  /*
   * EL CASO QUE PROTEGE AL USUARIO. Apagarla deja el sello puesto, asi que
   * volver a abrir la app no se la vuelve a encender. Una app que deshace la
   * decision del usuario cada vez que arranca es peor que una que no ayuda.
   */
  it('si la apagó a propósito, se queda apagada', () => {
    expect(shouldAutoEnableDetection(caso({ enabled: false, enabledSince: 1_700_000_000 }))).toBe(false)
  })

  /*
   * `connected` NO entra en la decision, y es deliberado: al volver del ajuste
   * del sistema Android puede tardar en vincular el servicio, y exigirlo creaba
   * una carrera que dejaba la deteccion apagada sin segunda oportunidad.
   */
  it('no depende de que el servicio ya esté vinculado', () => {
    // La entrada ni siquiera tiene ese campo: no hay forma de que influya.
    expect(shouldAutoEnableDetection({ granted: true, enabled: false, enabledSince: 0 })).toBe(true)
  })
})
