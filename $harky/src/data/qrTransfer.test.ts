import { describe, expect, it } from 'vitest'
import { buildTransferFrames, chunkPayload, decodeFrame, encodeFrame, QrTransferReceiver } from './qrTransfer'

describe('chunkPayload', () => {
  it('parte el texto en fragmentos del tamaño pedido', () => {
    expect(chunkPayload('abcdefghij', 3)).toEqual(['abc', 'def', 'ghi', 'j'])
  })

  it('un texto vacío produce un solo fragmento vacío', () => {
    expect(chunkPayload('', 100)).toEqual([''])
  })

  it('lanza si chunkSize es inválido', () => {
    expect(() => chunkPayload('abc', 0)).toThrow()
  })
})

describe('encodeFrame / decodeFrame', () => {
  it('codifica y decodifica sin pérdida', () => {
    const raw = encodeFrame('tx123', 2, 5, 'hola mundo')
    expect(decodeFrame(raw)).toEqual({ transferId: 'tx123', index: 2, total: 5, chunk: 'hola mundo' })
  })

  it('preserva separadores "|" dentro del contenido del chunk', () => {
    const raw = encodeFrame('tx123', 0, 1, '{"a":"b|c"}')
    expect(decodeFrame(raw)?.chunk).toBe('{"a":"b|c"}')
  })

  it('devuelve null para texto que no es un frame de $harky', () => {
    expect(decodeFrame('https://example.com')).toBeNull()
    expect(decodeFrame('')).toBeNull()
    expect(decodeFrame('SHKYQR1|solo-id')).toBeNull()
  })

  it('devuelve null si index/total son inconsistentes', () => {
    expect(decodeFrame(encodeFrame('tx', 5, 3, 'x'))).toBeNull() // index >= total
    expect(decodeFrame('SHKYQR1|tx|-1|3|x')).toBeNull()
  })
})

describe('buildTransferFrames', () => {
  it('genera N frames reconstruibles a partir de un payload', () => {
    const payload = 'x'.repeat(25)
    const frames = buildTransferFrames(payload, 10, 'abc')
    expect(frames).toHaveLength(3)
    frames.forEach((frame, i) => {
      const decoded = decodeFrame(frame)
      expect(decoded?.index).toBe(i)
      expect(decoded?.total).toBe(3)
      expect(decoded?.transferId).toBe('abc')
    })
  })
})

describe('QrTransferReceiver', () => {
  it('reconstruye el payload original a partir de frames en cualquier orden', () => {
    const payload = JSON.stringify({ hello: 'world', n: [1, 2, 3] })
    const frames = buildTransferFrames(payload, 6, 'transfer-1')
    const receiver = new QrTransferReceiver()
    const shuffled = [...frames].reverse()
    shuffled.forEach(frame => receiver.addFrame(frame))
    expect(receiver.isComplete).toBe(true)
    expect(receiver.assemble()).toBe(payload)
  })

  it('no está completo hasta recibir todas las partes', () => {
    const frames = buildTransferFrames('a'.repeat(30), 10, 'tx')
    const receiver = new QrTransferReceiver()
    receiver.addFrame(frames[0])
    expect(receiver.isComplete).toBe(false)
    expect(receiver.assemble()).toBeNull()
    receiver.addFrame(frames[1])
    receiver.addFrame(frames[2])
    expect(receiver.isComplete).toBe(true)
  })

  it('ignora frames repetidos (no dañan el conteo)', () => {
    const frames = buildTransferFrames('abcdefghij', 5, 'tx')
    const receiver = new QrTransferReceiver()
    receiver.addFrame(frames[0])
    receiver.addFrame(frames[0])
    expect(receiver.receivedCount).toBe(1)
  })

  it('ignora QR que no son de $harky', () => {
    const receiver = new QrTransferReceiver()
    const accepted = receiver.addFrame('https://random-qr.example')
    expect(accepted).toBe(false)
    expect(receiver.receivedCount).toBe(0)
  })

  it('reinicia si llega un transferId distinto (el emisor reinició)', () => {
    const framesA = buildTransferFrames('aaaaaaaaaa', 5, 'tx-a')
    const framesB = buildTransferFrames('bbbbb', 5, 'tx-b')
    const receiver = new QrTransferReceiver()
    receiver.addFrame(framesA[0])
    receiver.addFrame(framesB[0])
    expect(receiver.isComplete).toBe(true)
    expect(receiver.assemble()).toBe('bbbbb')
  })
})
