import { useSettings } from '@/store/settings'

export interface ErrorReport {
  id: string
  scope: 'app' | 'view'
  diagnostic: string
  message: string
  stack?: string
  componentStack?: string
  url: string
  appVersion: string
  createdAt: string
}

const ERROR_REPORTS_KEY = 'sharky-error-reports-v1'
const MAX_ERROR_REPORTS = 20

export function captureErrorReport(params: {
  scope: ErrorReport['scope']
  diagnostic: string
  error: Error
  componentStack?: string
  appVersion: string
}): ErrorReport | null {
  if (!useSettings.getState().errorTelemetryEnabled) return null
  const report: ErrorReport = {
    id: `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    scope: params.scope,
    diagnostic: params.diagnostic,
    message: params.error.message,
    stack: params.error.stack,
    componentStack: params.componentStack,
    url: typeof window === 'undefined' ? '' : window.location.href,
    appVersion: params.appVersion,
    createdAt: new Date().toISOString(),
  }
  writeReports([report, ...listErrorReports()].slice(0, MAX_ERROR_REPORTS))
  return report
}

export function listErrorReports(): ErrorReport[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(ERROR_REPORTS_KEY) ?? '[]') as ErrorReport[]
    return Array.isArray(value) ? value.filter(isErrorReport).slice(0, MAX_ERROR_REPORTS) : []
  } catch {
    return []
  }
}

export function clearErrorReports(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(ERROR_REPORTS_KEY)
}

function writeReports(reports: ErrorReport[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(ERROR_REPORTS_KEY, JSON.stringify(reports))
}

function isErrorReport(value: unknown): value is ErrorReport {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<ErrorReport>
  return typeof report.id === 'string'
    && (report.scope === 'app' || report.scope === 'view')
    && typeof report.diagnostic === 'string'
    && typeof report.message === 'string'
    && typeof report.createdAt === 'string'
}
