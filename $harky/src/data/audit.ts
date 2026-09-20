export type AuditEventType = 'account' | 'backup' | 'import' | 'recovery'

export interface AuditEvent {
  id: string
  type: AuditEventType
  label: string
  detail?: string
  createdAt: string
}

const AUDIT_KEY = 'sharky-audit-v1'
const MAX_EVENTS = 40

export function listAuditEvents(): AuditEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as AuditEvent[]
    return Array.isArray(value) ? value.filter(isAuditEvent).slice(0, MAX_EVENTS) : []
  } catch {
    return []
  }
}

export function recordAuditEvent(type: AuditEventType, label: string, detail?: string): AuditEvent {
  const event: AuditEvent = {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    detail,
    createdAt: new Date().toISOString(),
  }
  localStorage.setItem(AUDIT_KEY, JSON.stringify([event, ...listAuditEvents()].slice(0, MAX_EVENTS)))
  return event
}

function isAuditEvent(value: unknown): value is AuditEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<AuditEvent>
  return typeof event.id === 'string'
    && ['account', 'backup', 'import', 'recovery'].includes(event.type ?? '')
    && typeof event.label === 'string'
    && typeof event.createdAt === 'string'
}
