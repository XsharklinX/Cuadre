import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './Icon'
import { APP_VERSION } from '@/data/release'
import { captureErrorReport } from '@/data/telemetry'
import { tt } from '@/i18n'
import { log } from '@/lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
  diagnostic: string | null
  details: string | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, diagnostic: null, details: null, copied: false }

  static getDerivedStateFromError(): State {
    return { failed: true, diagnostic: null, details: null, copied: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const diagnostic = makeDiagnostic('APP')
    const details = makeDetails(error, info)
    this.setState({ diagnostic, details })
    captureErrorReport({
      scope: 'app',
      diagnostic,
      error,
      componentStack: info.componentStack ?? undefined,
      appVersion: APP_VERSION,
    })
    log.error('Unhandled application error', { error, info })
  }

  copyDiagnostic = async () => {
    await copyText(buildClipboardReport(this.state.diagnostic, this.state.details))
    this.setState({ copied: true })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-error">
      <span className="empty-ico"><Icon name="shark" size={30} /></span>
      <h1>{tt('fatalErrorTitle')}</h1>
      <p>{tt('fatalErrorBody')}</p>
      {this.state.diagnostic && <small className="diagnostic-code">{tt('diagnosticLabel')}: {this.state.diagnostic}</small>}
      {this.state.details && <pre className="diagnostic-details">{this.state.details}</pre>}
      <button className="btn-ghost" onClick={this.copyDiagnostic}>
        {this.state.copied ? tt('diagnosticCopied') : tt('copyDiagnostic')}
      </button>
      <button className="btn-primary lg" onClick={() => window.location.reload()}>{tt('reloadLabel')}</button>
    </main>
  }
}

export class ViewErrorBoundary extends Component<Props & { resetKey: string }, State> {
  state: State = { failed: false, diagnostic: null, details: null, copied: false }

  static getDerivedStateFromError(): State {
    return { failed: true, diagnostic: null, details: null, copied: false }
  }

  componentDidUpdate(previous: Props & { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false, diagnostic: null, details: null, copied: false })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const diagnostic = makeDiagnostic('VIEW')
    const details = makeDetails(error, info)
    this.setState({ diagnostic, details })
    captureErrorReport({
      scope: 'view',
      diagnostic,
      error,
      componentStack: info.componentStack ?? undefined,
      appVersion: APP_VERSION,
    })
    log.error('Unhandled view error', { error, info })
  }

  copyDiagnostic = async () => {
    await copyText(buildClipboardReport(this.state.diagnostic, this.state.details))
    this.setState({ copied: true })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="card view-error">
      <Icon name="alert" size={20} />
      <div>
        <h2>{tt('viewErrorTitle')}</h2>
        <p>{tt('viewErrorBody')}</p>
        {this.state.diagnostic && <small className="diagnostic-code">{tt('diagnosticLabel')}: {this.state.diagnostic}</small>}
        {this.state.details && <pre className="diagnostic-details">{this.state.details}</pre>}
        <div className="error-actions">
          <button className="btn-ghost" onClick={this.copyDiagnostic}>
            {this.state.copied ? tt('diagnosticCopied') : tt('copyDiagnostic')}
          </button>
          <button className="btn-ghost" onClick={() => this.setState({ failed: false, diagnostic: null, details: null, copied: false })}>{tt('retrySection')}</button>
        </div>
      </div>
    </section>
  }
}

function makeDiagnostic(scope: string): string {
  return `${scope}-${Date.now().toString(36).toUpperCase()}`
}

function makeDetails(error: Error, info: ErrorInfo): string {
  const stack = error.stack ? `\n${error.stack}` : ''
  const componentStack = info.componentStack ? `\nComponent stack:${info.componentStack}` : ''
  return `${error.name}: ${error.message}${stack}${componentStack}`.slice(0, 4000)
}

function buildClipboardReport(diagnostic: string | null, details: string | null): string {
  return [
    '$harky error report',
    `Version: ${APP_VERSION}`,
    diagnostic ? `Diagnostic: ${diagnostic}` : null,
    details,
  ].filter(Boolean).join('\n\n')
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}
