import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useAuth } from '@/store/auth'
import { useCloudSync } from '@/data/cloudSync'
import { useT } from '@/i18n'

/**
 * Indicador de estado de sincronización cloud en el TopBar. Solo se muestra a
 * usuarios con sesión cloud. Comunica de un vistazo si los datos están al día,
 * pendientes, sincronizando o en conflicto, para evitar sustos con los datos.
 */
export function MobileSyncBadge() {
  const mode = useAuth(s => s.user?.mode)
  const busy = useCloudSync(s => s.busy)
  const pending = useCloudSync(s => s.pending)
  const conflicts = useCloudSync(s => s.conflicts)
  const syncNow = useCloudSync(s => s.syncNow)
  const t = useT()

  if (mode !== 'cloud') return null

  const state = busy ? 'busy' : conflicts.length ? 'conflict' : pending ? 'pending' : 'synced'
  const meta = {
    busy:     { icon: 'refresh' as const, label: t('syncing') },
    conflict: { icon: 'alert'   as const, label: t('syncConflictsShort').replace('{n}', String(conflicts.length)) },
    pending:  { icon: 'refresh' as const, label: t('syncPending') },
    synced:   { icon: 'check'   as const, label: t('syncedLabel') },
  }[state]

  const onTap = () => {
    if (busy) return
    if (conflicts.length) { toast(t('resolveInSettings'), { icon: 'alert' }); return }
    void syncNow()
  }

  return (
    <button
      className={`mobile-sync-badge ${state}`}
      aria-label={meta.label}
      title={meta.label}
      onClick={onTap}
    >
      <Icon name={meta.icon} size={16} />
      {state === 'conflict' && <span className="mobile-sync-count">{conflicts.length}</span>}
    </button>
  )
}
