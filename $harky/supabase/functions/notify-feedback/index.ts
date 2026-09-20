// Edge Function: reenvía por correo cada comentario nuevo de la tabla
// `feedback`. Se invoca con un Database Webhook (INSERT en public.feedback).
//
// Secrets requeridos (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   — API key de https://resend.com (plan gratis: 100/día)
//   FEEDBACK_EMAIL   — correo destino (el tuyo; nunca visible en el cliente)
//
// Deploy:  supabase functions deploy notify-feedback --no-verify-jwt
// Webhook: Dashboard → Database → Webhooks → Create:
//   tabla public.feedback, evento INSERT, tipo "Supabase Edge Function",
//   función notify-feedback.

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload?.record
    if (!record?.message) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 })
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const to = Deno.env.get('FEEDBACK_EMAIL')
    if (!apiKey || !to) {
      console.error('Faltan secrets RESEND_API_KEY o FEEDBACK_EMAIL')
      return new Response(JSON.stringify({ error: 'missing-secrets' }), { status: 500 })
    }

    const meta = [
      record.app_version ? `Versión: ${record.app_version}` : null,
      record.platform ? `Plataforma: ${record.platform}` : null,
      record.language ? `Idioma: ${record.language}` : null,
      record.user_email ? `Usuario: ${record.user_email}` : 'Usuario: anónimo',
      record.created_at ? `Fecha: ${record.created_at}` : null,
    ].filter(Boolean).join('\n')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: '$harky Feedback <onboarding@resend.dev>',
        to: [to],
        subject: `💬 Nuevo comentario en $harky (${record.platform ?? '?'} · v${record.app_version ?? '?'})`,
        text: `${record.message}\n\n---\n${meta}`,
      }),
    })

    if (!response.ok) {
      console.error('Resend respondió con error', response.status, await response.text())
      return new Response(JSON.stringify({ error: 'resend-failed' }), { status: 502 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (error) {
    console.error('notify-feedback falló', error)
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 })
  }
})
