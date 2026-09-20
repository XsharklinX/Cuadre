import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureErrorReport, clearErrorReports, listErrorReports } from './telemetry'
import { useSettings } from '@/store/settings'

describe('error telemetry', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    clearErrorReports()
    useSettings.getState().errorTelemetryEnabled = false
  })

  it('does not capture reports unless the user enables telemetry', () => {
    const report = captureErrorReport({
      scope: 'view',
      diagnostic: 'VIEW-TEST',
      error: new Error('boom'),
      appVersion: '1.4.0',
    })

    expect(report).toBeNull()
    expect(listErrorReports()).toHaveLength(0)
  })

  it('stores local diagnostics when enabled', () => {
    useSettings.getState().errorTelemetryEnabled = true

    const report = captureErrorReport({
      scope: 'app',
      diagnostic: 'APP-TEST',
      error: new Error('failed'),
      componentStack: 'stack',
      appVersion: '1.4.0',
    })

    expect(report?.diagnostic).toBe('APP-TEST')
    expect(listErrorReports()[0]).toMatchObject({
      scope: 'app',
      diagnostic: 'APP-TEST',
      message: 'failed',
      appVersion: '1.4.0',
    })
  })
})
