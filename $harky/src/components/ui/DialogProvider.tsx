import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ModalShell } from '@/components/ui/ModalShell'
import type { IconName } from '@/types'

type DialogTone = 'default' | 'danger'

interface ConfirmDialogOptions {
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  icon?: IconName
  tone?: DialogTone
}

interface PromptDialogOptions {
  title: string
  description?: ReactNode
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  icon?: IconName
  validate?: (value: string) => string | null
}

interface DialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
  prompt: (options: PromptDialogOptions) => Promise<string | null>
}

type DialogState =
  | { kind: 'confirm'; options: ConfirmDialogOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptDialogOptions; value: string; error: string; resolve: (value: string | null) => void }
  | null

const DialogContext = createContext<DialogContextValue | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null)

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>(resolve => {
    setDialog({ kind: 'confirm', options, resolve })
  }), [])

  const prompt = useCallback((options: PromptDialogOptions) => new Promise<string | null>(resolve => {
    setDialog({ kind: 'prompt', options, value: options.initialValue ?? '', error: '', resolve })
  }), [])

  const closeConfirm = (value: boolean) => {
    if (dialog?.kind !== 'confirm') return
    dialog.resolve(value)
    setDialog(null)
  }

  const closePrompt = (value: string | null) => {
    if (dialog?.kind !== 'prompt') return
    dialog.resolve(value)
    setDialog(null)
  }

  const submitPrompt = () => {
    if (dialog?.kind !== 'prompt') return
    const value = dialog.value.trim()
    const error = dialog.options.validate?.(value) ?? (!value ? 'Escribe un valor para continuar.' : null)
    if (error) {
      setDialog({ ...dialog, error })
      return
    }
    closePrompt(value)
  }

  const contextValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  return (
    <DialogContext.Provider value={contextValue}>
      {children}

      {dialog?.kind === 'confirm' && (
        <ModalShell
          title={dialog.options.title}
          description={dialog.options.description}
          icon={dialog.options.icon ?? (dialog.options.tone === 'danger' ? 'alert' : 'check')}
          className="dialog-centered"
          maxWidth={420}
          onClose={() => closeConfirm(false)}
          footer={(
            <>
              <button className="btn-ghost" onClick={() => closeConfirm(false)}>
                {dialog.options.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                className={dialog.options.tone === 'danger' ? 'btn-danger' : 'btn-primary'}
                onClick={() => closeConfirm(true)}>
                {dialog.options.tone === 'danger' && <Icon name="trash" size={15} />}
                {dialog.options.confirmLabel ?? 'Confirmar'}
              </button>
            </>
          )}>
          <div />
        </ModalShell>
      )}

      {dialog?.kind === 'prompt' && (
        <ModalShell
          title={dialog.options.title}
          description={dialog.options.description}
          icon={dialog.options.icon ?? 'edit'}
          className="dialog-centered"
          maxWidth={420}
          onClose={() => closePrompt(null)}
          footer={(
            <>
              <button className="btn-ghost" onClick={() => closePrompt(null)}>
                {dialog.options.cancelLabel ?? 'Cancelar'}
              </button>
              <button className="btn-primary" onClick={submitPrompt}>
                {dialog.options.confirmLabel ?? 'Guardar'}
              </button>
            </>
          )}>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="dialog-prompt-input">{dialog.options.label}</label>
            <input
              id="dialog-prompt-input"
              className="select"
              value={dialog.value}
              placeholder={dialog.options.placeholder}
              onChange={event => setDialog({ ...dialog, value: event.target.value, error: '' })}
              onKeyDown={event => {
                if (event.key === 'Enter') submitPrompt()
              }}
            />
            {dialog.error && <p className="auth-error" role="alert">{dialog.error}</p>}
          </div>
        </ModalShell>
      )}
    </DialogContext.Provider>
  )
}

export function useDialogs() {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialogs must be used inside DialogProvider')
  return context
}
