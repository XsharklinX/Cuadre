import { useState } from 'react'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { submitFeedback } from '@/data/feedback'
import { APP_VERSION } from '@/data/release'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

const CONTACT_EMAIL = 'contactosharklin@gmail.com'
// Fecha en que se actualizó por última vez el texto legal (no la fecha de hoy):
// refleja cuándo cambió el contenido, como corresponde a un documento legal.
const LEGAL_UPDATED = new Date('2026-07-18T00:00:00')

type LegalSection = { title: string; body: string[] }
type LegalDoc = Record<'es' | 'en', LegalSection[]>

const PRIVACY_SECTIONS: LegalDoc = {
  es: [
    {
      title: '1. En resumen',
      body: [
        '$harky es una app de finanzas personales que funciona en tu dispositivo. Tus datos financieros — cuentas, movimientos, categorías, presupuestos y metas — se guardan solo en tu teléfono. No necesitas crear una cuenta, no necesitas conexión a internet para usarla, y nada sale de tu dispositivo a menos que tú lo decidas explícitamente.',
      ],
    },
    {
      title: '2. Responsable',
      body: [
        `$harky es desarrollada y mantenida por David Bonilla ("el Desarrollador", "nosotros"). Para cualquier duda sobre esta política o tus datos, escríbenos a ${CONTACT_EMAIL}.`,
      ],
    },
    {
      title: '3. Qué información sale de tu dispositivo',
      body: [
        'Por diseño, casi nada. La app es local: los cálculos, reportes, presupuestos y proyecciones se generan en tu teléfono a partir de lo que tú registras.',
        'Comentarios (opcional): si usas la sección "Comentarios" de Configuración, el texto que escribes se nos envía para poder leerlo y responder, junto con datos básicos de contexto como la versión de la app y la plataforma.',
        'Respaldos (opcional): los respaldos por archivo o por código QR los generas y compartes tú manualmente. El Desarrollador nunca los recibe.',
      ],
    },
    {
      title: '4. Notificaciones bancarias (opcional)',
      body: [
        'Si activas la detección de transacciones, la app lee las notificaciones de tus apps y correos de banco únicamente para sugerirte movimientos. Ese análisis ocurre por completo en tu dispositivo: el contenido de tus notificaciones no se envía a ningún servidor ni al Desarrollador. Puedes desactivar este permiso cuando quieras desde los ajustes del sistema.',
      ],
    },
    {
      title: '5. Sin publicidad ni rastreadores',
      body: [
        'No mostramos publicidad, no incluimos rastreadores comerciales de terceros, y no vendemos, alquilamos ni compartimos tus datos financieros con fines publicitarios o comerciales. Nunca.',
      ],
    },
    {
      title: '6. Seguridad',
      body: [
        'Lo que sí sale de tu dispositivo (tus comentarios) viaja cifrado en tránsito (HTTPS/TLS). Los respaldos que exportas puedes protegerlos con contraseña. Aun así, ningún sistema es perfectamente seguro, por lo que no podemos garantizar protección absoluta.',
      ],
    },
    {
      title: '7. Tus derechos y control',
      body: [
        'Puedes usar $harky totalmente sin conexión y sin cuenta; en ese caso tus datos nunca salen del teléfono.',
        'Puedes exportar una copia de tus datos cuando quieras desde Configuración → Datos → Exportar respaldo, y restaurarla luego.',
        'Puedes borrar de forma permanente todos tus datos desde Configuración → Datos → Borrar todos los datos.',
        `Si tienes cualquier solicitud sobre tus datos, escríbenos a ${CONTACT_EMAIL} y la atenderemos en un plazo razonable.`,
      ],
    },
    {
      title: '8. Menores',
      body: [
        '$harky no está dirigida a menores de 13 años y no recopilamos conscientemente información de menores. Si crees que un menor nos ha facilitado datos personales, contáctanos para eliminarlos.',
      ],
    },
    {
      title: '9. Cambios',
      body: [
        'Podemos actualizar esta Política de Privacidad de vez en cuando. Si los cambios son relevantes, te avisaremos dentro de la app. La fecha de la última actualización siempre aparece al inicio de este documento.',
      ],
    },
    {
      title: '10. Contacto',
      body: [`Para dudas o solicitudes sobre tu privacidad, escríbenos a ${CONTACT_EMAIL}.`],
    },
  ],
  en: [
    {
      title: '1. In short',
      body: [
        '$harky is a personal finance app that runs on your device. Your financial data — accounts, transactions, categories, budgets and goals — is stored only on your phone. You do not need an account, you do not need an internet connection to use it, and nothing leaves your device unless you explicitly choose to send it.',
      ],
    },
    {
      title: '2. Who is responsible',
      body: [
        `$harky is developed and maintained by David Bonilla ("the Developer", "we"). For any question about this policy or your data, write to us at ${CONTACT_EMAIL}.`,
      ],
    },
    {
      title: '3. What leaves your device',
      body: [
        'By design, almost nothing. The app is local: calculations, reports, budgets and projections are generated on your phone from what you enter.',
        'Comments (optional): if you use the "Comments" section in Settings, the text you write is sent to us so we can read and respond to it, along with basic context such as the app version and platform.',
        'Backups (optional): file and QR-code backups are generated and shared by you, manually. The Developer never receives them.',
      ],
    },
    {
      title: '4. Bank notifications (optional)',
      body: [
        'If you enable transaction detection, the app reads notifications from your banking apps and emails solely to suggest movements to you. That analysis happens entirely on your device: the content of your notifications is never sent to any server or to the Developer. You can revoke this permission at any time from your system settings.',
      ],
    },
    {
      title: '5. No ads, no trackers',
      body: [
        'We show no advertising, include no third-party commercial trackers, and never sell, rent or share your financial data for advertising or commercial purposes. Ever.',
      ],
    },
    {
      title: '6. Security',
      body: [
        'What does leave your device (your comments) travels encrypted in transit (HTTPS/TLS). Backups you export can be protected with a password. Still, no system is perfectly secure, so we cannot guarantee absolute protection.',
      ],
    },
    {
      title: '7. Your rights and control',
      body: [
        'You can use $harky fully offline and without an account; in that case your data never leaves your phone.',
        'You can export a copy of your data at any time from Settings → Data → Export backup, and restore it later.',
        'You can permanently delete all your data from Settings → Data → Delete all data.',
        `For any request about your data, write to us at ${CONTACT_EMAIL} and we will handle it within a reasonable time.`,
      ],
    },
    {
      title: '8. Children',
      body: [
        '$harky is not directed at children under 13 and we do not knowingly collect information from minors. If you believe a minor has provided us with personal data, please contact us so we can remove it.',
      ],
    },
    {
      title: '9. Changes',
      body: [
        'We may update this Privacy Policy from time to time. If the changes are significant, we will notify you inside the app. The date of the latest update always appears at the top of this document.',
      ],
    },
    {
      title: '10. Contact',
      body: [`For questions or requests about your privacy, write to us at ${CONTACT_EMAIL}.`],
    },
  ],
}

const TERMS_SECTIONS: LegalDoc = {
  es: [
    {
      title: '1. Aceptación',
      body: [
        'Al descargar, instalar o usar $harky ("la app"), aceptas estos Términos de Uso. Si no estás de acuerdo con ellos, por favor no uses la app.',
      ],
    },
    {
      title: '2. Qué es $harky',
      body: [
        '$harky es una herramienta de organización de finanzas personales para registrar ingresos, gastos, presupuestos y metas de ahorro. Es una herramienta informativa y de organización: no es una institución financiera, ni un banco, ni un asesor de inversiones, y no sustituye la asesoría profesional.',
      ],
    },
    {
      title: '3. No es asesoría financiera',
      body: [
        'La información, cálculos, proyecciones y reportes que genera la app se basan únicamente en los datos que tú ingresas y son solo orientativos. No constituyen asesoría financiera, legal, contable ni fiscal. Te recomendamos consultar a un profesional calificado antes de tomar decisiones financieras importantes.',
      ],
    },
    {
      title: '4. Tu responsabilidad',
      body: [
        'Eres el único responsable de la exactitud de la información que ingresas y de mantener respaldos de tus datos. Como la app guarda todo en tu dispositivo, la pérdida o el reinicio del teléfono sin un respaldo puede implicar la pérdida de tus datos: usa la función de exportar respaldo con regularidad.',
      ],
    },
    {
      title: '5. Uso aceptable',
      body: [
        'Te comprometes a usar $harky de forma lícita y a no intentar vulnerar, hacer ingeniería inversa, sobrecargar o comprometer de cualquier forma la seguridad de la app o de los servicios que la respaldan.',
      ],
    },
    {
      title: '6. Propiedad intelectual',
      body: [
        'El nombre "$harky", su logo, diseño visual, código fuente y contenido son propiedad de David Bonilla, salvo las librerías de terceros usadas bajo sus respectivas licencias de código abierto.',
      ],
    },
    {
      title: '7. Disponibilidad',
      body: [
        'Hacemos un esfuerzo razonable por mantener la app funcionando correctamente, pero no garantizamos que esté libre de errores, sin interrupciones o siempre disponible.',
      ],
    },
    {
      title: '8. Limitación de responsabilidad',
      body: [
        'En la máxima medida permitida por la ley aplicable, David Bonilla no será responsable de daños indirectos, incidentales o consecuentes derivados del uso o la imposibilidad de uso de la app — incluyendo, entre otros, la pérdida de datos o las decisiones financieras tomadas con base en su información. La app se ofrece "tal cual" y "según disponibilidad", sin garantías de ningún tipo, expresas o implícitas.',
      ],
    },
    {
      title: '9. Cambios',
      body: [
        'Podemos actualizar, modificar o descontinuar funciones de la app, así como estos Términos de Uso, en cualquier momento. Te avisaremos de los cambios relevantes dentro de la app. Si sigues usando $harky tras un cambio, se considera que aceptas los nuevos términos.',
      ],
    },
    {
      title: '10. Terminación',
      body: [
        'Puedes dejar de usar la app y borrar tus datos cuando quieras, sin necesidad de avisar a nadie.',
      ],
    },
    {
      title: '11. Ley aplicable',
      body: [
        'Estos Términos se rigen por las leyes de la República Dominicana, sin perjuicio de las normas de protección al consumidor que puedan aplicarte según tu lugar de residencia.',
      ],
    },
    {
      title: '12. Contacto',
      body: [`Para dudas sobre estos Términos de Uso, escríbenos a ${CONTACT_EMAIL}.`],
    },
  ],
  en: [
    {
      title: '1. Acceptance',
      body: [
        'By downloading, installing or using $harky ("the app"), you agree to these Terms of Use. If you do not agree with them, please do not use the app.',
      ],
    },
    {
      title: '2. What $harky is',
      body: [
        '$harky is a personal finance organization tool for tracking income, expenses, budgets and savings goals. It is an informational and organizational tool: it is not a financial institution, a bank, or an investment advisor, and it does not replace professional advice.',
      ],
    },
    {
      title: '3. Not financial advice',
      body: [
        'The information, calculations, projections and reports the app generates are based solely on the data you enter and are for guidance only. They do not constitute financial, legal, accounting or tax advice. We recommend consulting a qualified professional before making important financial decisions.',
      ],
    },
    {
      title: '4. Your responsibility',
      body: [
        'You are solely responsible for the accuracy of the information you enter and for keeping backups of your data. Because the app stores everything on your device, losing or resetting your phone without a backup may mean losing your data: use the export-backup feature regularly.',
      ],
    },
    {
      title: '5. Acceptable use',
      body: [
        'You agree to use $harky lawfully, and not to attempt to breach, reverse-engineer, overload, or otherwise compromise the security of the app or the services that support it.',
      ],
    },
    {
      title: '6. Intellectual property',
      body: [
        'The "$harky" name, its logo, visual design, source code and content are the property of David Bonilla, except for third-party libraries used under their respective open-source licenses.',
      ],
    },
    {
      title: '7. Availability',
      body: [
        'We make a reasonable effort to keep the app running correctly, but we do not guarantee it will be error-free, uninterrupted, or always available.',
      ],
    },
    {
      title: '8. Limitation of liability',
      body: [
        'To the maximum extent permitted by applicable law, David Bonilla will not be liable for indirect, incidental or consequential damages arising from the use or inability to use the app — including, among others, data loss or financial decisions made based on its information. The app is provided "as is" and "as available", without warranties of any kind, express or implied.',
      ],
    },
    {
      title: '9. Changes',
      body: [
        'We may update, modify or discontinue features of the app, as well as these Terms of Use, at any time. We will notify you of relevant changes inside the app. If you keep using $harky after a change, you are considered to have accepted the new terms.',
      ],
    },
    {
      title: '10. Termination',
      body: [
        'You can stop using the app and delete your data whenever you want, with no need to notify anyone.',
      ],
    },
    {
      title: '11. Governing law',
      body: [
        'These Terms are governed by the laws of the Dominican Republic, without prejudice to any consumer-protection rules that may apply to you based on your place of residence.',
      ],
    },
    {
      title: '12. Contact',
      body: [`For questions about these Terms of Use, write to us at ${CONTACT_EMAIL}.`],
    },
  ],
}

export function SettingsLegal({ activeSheet, onOpen, onClose }: SheetProps) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'es' | 'en'
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)

  const updatedLabel = t('legalUpdatedLabel').replace(
    '{date}',
    LEGAL_UPDATED.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-DO', { year: 'numeric', month: 'long', day: 'numeric' }),
  )

  const sendComment = async () => {
    if (!commentText.trim() || sending) return
    setSending(true)
    try {
      const result = await submitFeedback(commentText)
      toast(result === 'sent' ? t('thanksForComment') : t('commentQueued'), { icon: 'check', type: 'ok' })
      setCommentText('')
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="mset-section">
        <span className="mset-section-title">{t('aboutSection')}</span>
        <div className="mset-card">
          <SettingsRow icon="edit"  iconColor="#5bc0ff" label={t('comments')}  onClick={() => onOpen('comments')} />
          <SettingsRow icon="info"  iconColor="#35d0a2" label={t('aboutUs')}   onClick={() => onOpen('about')} />
        </div>
        <div className="mset-card">
          <SettingsRow icon="shield" iconColor="#a78bfa" label={t('privacyPolicy')} onClick={() => onOpen('privacy')} />
          <SettingsRow icon="book"   iconColor="#f59e0b" label={t('termsOfUse')}    onClick={() => onOpen('terms')} />
        </div>
        <div className="mset-card">
          <div className="mset-info-row">
            <span>$harky</span>
            <span>v{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {activeSheet === 'comments' && (
        <SettingsSheet title={t('comments')} onClose={onClose}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">
              {t('commentsIntro')}
            </p>
            <textarea
              className="mset-textarea" rows={6}
              value={commentText} placeholder={t('commentPlaceholder')}
              onChange={e => setCommentText(e.target.value)}
            />
            <button className="mset-sheet-confirm" disabled={!commentText.trim() || sending} onClick={() => void sendComment()}>
              <Icon name="edit" size={16} style={{ marginRight: 8 }} /> {sending ? t('sendingComment') : t('sendComment')}
            </button>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'about' && (
        <SettingsSheet title={t('aboutUs')} onClose={onClose}>
          <div className="mset-sheet-body mset-about">
            <span className="mset-about-icon"><BrandMark size={76} /></span>
            <strong className="mset-about-name">$harky</strong>
            <span className="mset-about-version">{t('versionLabel').replace('{v}', APP_VERSION)}</span>
            <p className="mset-about-dev">{t('developedByLabel')} <strong>David Bonilla</strong></p>
            <p className="mset-about-desc">
              {t('aboutDesc')}
            </p>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'privacy' && (
        <SettingsSheet title={t('privacyPolicy')} onClose={onClose}>
          <div className="mset-sheet-body mset-legal">
            <p className="mset-legal-updated">{updatedLabel}</p>
            {PRIVACY_SECTIONS[lang].map(section => (
              <div key={section.title} className="mset-legal-section">
                <h3>{section.title}</h3>
                {section.body.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'terms' && (
        <SettingsSheet title={t('termsOfUse')} onClose={onClose}>
          <div className="mset-sheet-body mset-legal">
            <p className="mset-legal-updated">{updatedLabel}</p>
            {TERMS_SECTIONS[lang].map(section => (
              <div key={section.title} className="mset-legal-section">
                <h3>{section.title}</h3>
                {section.body.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
        </SettingsSheet>
      )}
    </>
  )
}
