import { describe, expect, it } from 'vitest'
import { classifyBankNotification, isBankNotification, parseBankNotification } from './bankNotificationParser'

// Atajo: clasifica y devuelve el tx (o null) para asserts concisos.
const tx = (pkg: string, title: string, text: string) => {
  const r = classifyBankNotification(pkg, title, text)
  return r.ok ? r.tx : null
}
const reason = (pkg: string, title: string, text: string) => {
  const r = classifyBankNotification(pkg, title, text)
  return r.ok ? 'ok' : r.reason
}

describe('rechaza lo que NO es un movimiento', () => {
  it('oferta de minutos de Claro desde su app (el bug reportado) → rechazada', () => {
    // Desde la app de telecom se rechaza por 'telecom'; lo importante: NO es un gasto.
    expect(reason('com.claro.miclaro', 'Claro', '¡Aprovecha! Recarga RD$100 y llévate 10GB gratis. Activa ya.')).toBe('telecom')
    expect(tx('com.claro.miclaro', 'Claro', '¡Aprovecha! Recarga RD$100 y llévate 10GB gratis.')).toBeNull()
  })

  it('misma oferta reenviada por SMS (no es app de telecom) → promotional', () => {
    expect(reason('com.google.android.apps.messaging', 'Claro', '¡Aprovecha! Recarga RD$100 y llévate 10GB gratis')).toBe('promotional')
  })

  it('código de verificación (OTP) con monto (3DS) → otp, no un gasto', () => {
    expect(reason('com.bhd.bankingapp', 'BHD', 'Autoriza el consumo de RD$500.00. Tu código de verificación es 483920')).toBe('otp')
    expect(reason('com.google.android.gm', 'PayPal', 'Tu código de seguridad para el pago de US$20.00 es 900112. No compartas este código.')).toBe('otp')
  })

  it('OTP sin monto se descarta igual (por no-amount)', () => {
    expect(tx('com.bhd.bankingapp', 'BHD', 'Tu código de verificación es 483920')).toBeNull()
  })

  it('mensaje de banco sin monto → no-amount', () => {
    expect(reason('com.bhd.bankingapp', 'BHD', 'Tu solicitud fue procesada con éxito')).toBe('no-amount')
  })

  it('correo cualquiera con un precio pero sin remitente bancario → not-financial', () => {
    expect(reason('com.google.android.gm', 'Amazon', 'Tu pedido de US$25.00 fue enviado')).toBe('not-financial')
  })

  it('chat normal → no-amount / no-tx', () => {
    expect(isBankNotification('com.whatsapp', 'Juan', 'Hola, ¿cómo estás?')).toBe(false)
  })

  it('app de compras con precio pero sin banco ni tarjeta → not-financial', () => {
    expect(reason('com.amazon.mShop.android', 'Amazon', 'Compra realizada por US$25.00, tu pedido va en camino')).toBe('not-financial')
  })
})

describe('capta transacciones de apps bancarias (RD$)', () => {
  it('compra con tarjeta (Popular)', () => {
    const t = tx('com.bpd.bppmovil', 'Banco Popular', 'Compra aprobada por RD$1,500.00 en SUPERMERCADO NACIONAL, tarjeta ****4821')
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(1500)
    expect(t?.currency).toBe('DOP')
    expect(t?.cardLast4).toBe('4821')
    expect(t?.note).toMatch(/NACIONAL/)
  })

  it('consumo Banreservas con tarjeta terminada en', () => {
    const t = tx('com.banreservas.tumovil', 'Banreservas', 'Se realizó un consumo por RD$800.00 en AMAZON con su tarjeta terminada en 1234')
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(800)
    expect(t?.cardLast4).toBe('1234')
  })

  it('depósito recibido → ingreso', () => {
    const t = tx('com.bhd.bankingapp', 'BHD', 'Depósito recibido por RD$5,000.00 en su cuenta')
    expect(t?.type).toBe('income')
    expect(t?.amount).toBe(5000)
  })
})

describe('capta transacciones que llegan por CORREO (remitente = banco)', () => {
  it('correo de Banreservas por Gmail', () => {
    const t = tx('com.google.android.gm', 'Banreservas', 'Notificación de transacción: consumo de RD$2,340.00 en JUMBO tarjeta terminada en 9087')
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(2340)
    expect(t?.cardLast4).toBe('9087')
  })

  it('correo de BHD por Outlook', () => {
    const t = tx('com.microsoft.office.outlook', 'BHD León', 'Realizaste un consumo de RD$450.00 en UBER')
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(450)
  })

  it('correo de Popular por Gmail', () => {
    expect(reason('com.google.android.gm', 'Banco Popular Dominicano', 'Compra por RD$999.99 en PRICESMART')).toBe('ok')
  })

  // El caso real reportado: el correo llega por Gmail con asunto genérico
  // ("notificaciones") y el banco SOLO aparece en el cuerpo. Antes se descartaba
  // como "not-financial"; ahora se reconoce por el banco en el cuerpo Y/O por la
  // tarjeta + verbo de consumo.
  it('aviso de consumo Banreservas por Gmail (banco solo en el cuerpo)', () => {
    const body = 'Notificaciones Banreservas\nNotificación de Consumo\nSu tarjeta ESTANDAR ••4500 presenta un consumo.\nMonto:\nDOP 100.00\nEstado:\nAPROBADO\nComercio:\nCLARO RECAR 8494016889 SANTO DOMINGO'
    const t = tx('com.google.android.gm', 'notificaciones', body)
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(100)
    expect(t?.currency).toBe('DOP')
    expect(t?.cardLast4).toBe('4500')
  })

  // Aunque el banco NO estuviera en la lista, un correo con tarjeta + verbo de
  // consumo debe captarse: la cuenta y el monto bastan (lo que pidió el usuario).
  it('correo de un banco desconocido con tarjeta + consumo → se capta', () => {
    const t = tx('com.google.android.gm', 'notificaciones', 'Su tarjeta ••7788 presenta un consumo por DOP 250.00 en SUPERMERCADO')
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(250)
    expect(t?.cardLast4).toBe('7788')
  })
})

describe('Qik y PayPal', () => {
  it('Qik: recibiste dinero → ingreso', () => {
    const t = tx('com.qik.wallet', 'Qik', 'Recibiste RD$1,000.00 de Juan Pérez')
    expect(t?.type).toBe('income')
    expect(t?.amount).toBe(1000)
  })

  it('Qik: enviaste dinero → gasto', () => {
    const t = tx('com.qik.wallet', 'Qik', 'Enviaste RD$500.00 a María')
    expect(t?.type).toBe('expense')
  })

  it('PayPal en USD → gasto en dólares', () => {
    const t = tx('com.paypal.android.p2pmobile', 'PayPal', 'You sent US$12.34 to Steam Store')
    expect(t?.type).toBe('expense')
    expect(t?.amount).toBe(12.34)
    expect(t?.currency).toBe('USD')
  })

  it('PayPal recibido en USD → ingreso', () => {
    const t = tx('com.paypal.android.p2pmobile', 'PayPal', 'You received US$50.00 from Client')
    expect(t?.type).toBe('income')
    expect(t?.currency).toBe('USD')
  })
})

describe('montos y monedas robustos', () => {
  it('moneda después del número: "2,500.00 DOP"', () => {
    expect(tx('com.banreservas.app', 'Banreservas', 'Consumo de 2,500.00 DOP en FARMACIA')?.amount).toBe(2500)
  })

  it('formato europeo "1.234,56"', () => {
    expect(tx('com.bhd.bankingapp', 'BHD', 'Consumo de RD$1.234,56 en TIENDA')?.amount).toBeCloseTo(1234.56)
  })

  it('detecta USD por "US$"', () => {
    expect(tx('com.scotiabank.do', 'Scotiabank', 'Consumo de US$40.00 en NETFLIX')?.currency).toBe('USD')
  })
})

describe('comercio limpio (nota)', () => {
  it('no confunde "de RD$500" con el comercio; toma "en FARMACIA"', () => {
    expect(tx('com.banreservas.app', 'Banreservas', 'Consumo de RD$500.00 en FARMACIA CAROL')?.note).toBe('FARMACIA CAROL')
  })

  it('recorta la cola ", tarjeta ****"', () => {
    expect(tx('com.bpd.bppmovil', 'Popular', 'Compra por RD$1,500.00 en SUPERMERCADO NACIONAL, tarjeta ****4821')?.note).toBe('SUPERMERCADO NACIONAL')
  })

  it('Qik: toma el remitente tras "de"', () => {
    expect(tx('com.qik.wallet', 'Qik', 'Recibiste RD$1,000.00 de Juan Pérez')?.note).toBe('Juan Pérez')
  })
})

describe('compatibilidad', () => {
  it('parseBankNotification sigue devolviendo el tx', () => {
    const p = parseBankNotification('Compra', 'Compra por RD$300.00 en COLMADO tarjeta ****1234')
    expect(p?.amount).toBe(300)
    expect(p?.cardLast4).toBe('1234')
  })
})
