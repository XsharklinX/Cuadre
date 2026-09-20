import { Suspense, lazy, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ViewErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useT } from '@/i18n'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

const MobileQrExport = lazy(() => import('../MobileQrExport').then(m => ({ default: m.MobileQrExport })))
const MobileQrImport = lazy(() => import('../MobileQrImport').then(m => ({ default: m.MobileQrImport })))

// `grouped` se acepta por consistencia con los demás componentes de una sola
// fila; esta tarjeta ya se renderiza sin título de sección, así que no cambia
// su salida — solo evita un error de tipos al componerla dentro de un grupo.
export function SettingsMigration({ activeSheet, onOpen, onClose }: Pick<SheetProps, 'activeSheet' | 'onOpen' | 'onClose'> & { grouped?: boolean }) {
  const t = useT()
  const [mode, setMode] = useState<'send' | 'receive' | null>(null)

  return (
    <>
      <div className="mset-card">
        <SettingsRow icon="repeat" iconColor="#5bc0ff" label={t('qrMigrationLabel')}
          onClick={() => onOpen('qrMigration')} />
      </div>

      {activeSheet === 'qrMigration' && (
        <SettingsSheet title={t('qrMigrationLabel')} onClose={onClose}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">{t('qrMigrationIntro')}</p>
            <div className="mset-card" style={{ margin: 0 }}>
              <SettingsRow icon="download" iconColor="#35d0a2" label={t('qrMigrationSendLabel')}
                onClick={() => setMode('send')} />
              <SettingsRow icon="camera" iconColor="#a78bfa" label={t('qrMigrationReceiveLabel')}
                onClick={() => setMode('receive')} />
            </div>
            <div className="mqr-mode-hints">
              <p><Icon name="download" size={13} /> {t('qrMigrationSendDesc')}</p>
              <p><Icon name="camera" size={13} /> {t('qrMigrationReceiveDesc')}</p>
            </div>
          </div>
        </SettingsSheet>
      )}

      {mode === 'send' && (
        <ViewErrorBoundary resetKey="qr-export">
          <Suspense fallback={null}>
            <MobileQrExport onClose={() => setMode(null)} />
          </Suspense>
        </ViewErrorBoundary>
      )}
      {mode === 'receive' && (
        <ViewErrorBoundary resetKey="qr-import">
          <Suspense fallback={null}>
            <MobileQrImport onClose={() => setMode(null)} />
          </Suspense>
        </ViewErrorBoundary>
      )}
    </>
  )
}
