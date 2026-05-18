import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { agentList } from '@/lib/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const resend = new Resend(process.env.RESEND_API_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const DAILY_PROMPT =
  'Δώσε μου 1 έξυπνη ιδέα για σήμερα για την επιχείρησή σου. Σύντομα, 2-3 προτάσεις μόνο.'

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date().toLocaleDateString('el-GR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const sections = await Promise.all(
    agentList.map(async (agent) => {
      const { data: memories } = await supabase
        .from('agent_memory')
        .select('memory_key, memory_value')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(10)

      let systemPrompt = agent.systemPrompt
      if (memories && memories.length > 0) {
        const memLines = memories
          .map((m) => `- ${m.memory_key}: ${m.memory_value}`)
          .join('\n')
        systemPrompt += `\n\nΜνήμες agent:\n${memLines}`
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: DAILY_PROMPT }],
      })

      const idea =
        response.content[0].type === 'text' ? response.content[0].text : '—'

      return { agent, idea }
    }),
  )

  const html = buildEmailHtml(sections, today)

  await resend.emails.send({
    from: 'Giannis Agents <onboarding@resend.dev>',
    to: process.env.DAILY_EMAIL_TO!,
    subject: `🧠 Ιδέες των Agents σου — ${today}`,
    html,
  })

  return Response.json({ ok: true, date: today })
}

function buildEmailHtml(
  sections: Array<{ agent: (typeof agentList)[number]; idea: string }>,
  date: string,
) {
  const agentSections = sections
    .map(
      ({ agent, idea }) => `
    <div style="margin-bottom:28px;border-left:4px solid ${agent.color};padding-left:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="background:${agent.color};color:#fff;border-radius:50%;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;text-align:center;line-height:32px;">
          ${agent.initials}
        </div>
        <span style="font-size:16px;font-weight:600;color:#111827;">${agent.name}</span>
        <span style="font-size:12px;color:#6b7280;">${agent.description}</span>
      </div>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${idea.replace(/\n/g, '<br>')}</p>
    </div>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#111827;padding:24px 32px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="background:rgba(255,255,255,.1);border-radius:8px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;">AI</div>
        <div>
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Giannis Agents</p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,.5);">Καθημερινό digest — ${date}</p>
        </div>
      </div>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 24px;font-size:20px;color:#111827;">🧠 Ιδέες για σήμερα</h2>
      ${agentSections}
    </div>
    <div style="background:#f9fafb;padding:16px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Αυτό το email στάλθηκε αυτόματα από τους Agents σου.</p>
    </div>
  </div>
</body>
</html>`
}
