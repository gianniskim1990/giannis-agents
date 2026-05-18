import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { agents } from '@/lib/agents'
import Anthropic from '@anthropic-ai/sdk'
import ApproveClient from './ApproveClient'

const colorLabels: Record<string, string> = {
  'level-up': 'ινδιγκό/μπλε (#6366f1)',
  pigiota: 'μοβ (#8b5cf6)',
  project4you: 'πράσινο/teal (#10b981)',
  ena: 'κεχριμπάρι/πορτοκαλί (#f59e0b)',
}

const FALLBACK = 'Δεν ήταν δυνατή η δημιουργία'

function ErrorPage({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#111827]">
      <div className="max-w-md text-center">
        <p className="mb-2 text-white">{message}</p>
        {detail && <p className="mb-4 text-xs text-gray-500">{detail}</p>}
        <a
          href="/"
          className="rounded-xl bg-white/10 px-5 py-2 text-sm text-white transition-colors hover:bg-white/20"
        >
          ← Πίσω στην εφαρμογή
        </a>
      </div>
    </div>
  )
}

function parseClaudeJson(text: string) {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  return JSON.parse(stripped.slice(start, end + 1))
}

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  console.log('[approve] page rendering')

  // --- Auth ---
  let user = null
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase.auth.getUser()
    if (error) console.error('[approve] auth error:', error.message)
    user = data?.user ?? null
    console.log('[approve] user:', user?.email ?? 'none')
  } catch (e) {
    console.error('[approve] auth threw:', e)
  }

  if (!user) {
    redirect('/login')
  }

  // --- Params ---
  const { id } = await searchParams
  console.log('[approve] id param:', id)

  if (!id) {
    return <ErrorPage message="Λείπει το αναγνωριστικό ιδέας." detail="Παράμετρος id δεν βρέθηκε στο URL." />
  }

  // --- Fetch from Supabase ---
  let pending: { agent_id: string; idea_text: string } | null = null
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase
      .from('pending_ideas')
      .select('agent_id, idea_text')
      .eq('id', id)
      .single()

    if (error) {
      console.error('[approve] supabase error:', error.code, error.message)
    } else {
      console.log('[approve] found idea for agent:', data?.agent_id)
    }
    pending = data
  } catch (e) {
    console.error('[approve] supabase threw:', e)
    return <ErrorPage message="Σφάλμα σύνδεσης με τη βάση δεδομένων." detail={String(e)} />
  }

  if (!pending) {
    return (
      <ErrorPage
        message="Η ιδέα δεν βρέθηκε."
        detail="Ο σύνδεσμος μπορεί να έχει λήξει ή ο πίνακας pending_ideas να μην έχει δημιουργηθεί."
      />
    )
  }

  const agent = agents[pending.agent_id]
  const idea: string = pending.idea_text
  console.log('[approve] idea length:', idea.length, 'agent:', pending.agent_id)

  if (!agent) {
    return <ErrorPage message="Άγνωστος agent." detail={`agent_id: ${pending.agent_id}`} />
  }

  const colorLabel = colorLabels[pending.agent_id] ?? agent.color

  // --- Claude API ---
  let content = {
    socialText: FALLBACK,
    caption: FALLBACK,
    hashtags: [] as string[],
    canvaInstructions: FALLBACK,
  }

  try {
    console.log('[approve] calling Claude API')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `You are a social media content creator. Based on this idea, generate content. You MUST respond with ONLY a valid JSON object, no markdown, no explanation, just the JSON:
{
  "socialText": "ready to post Greek social media text, 2-3 paragraphs, no markdown asterisks",
  "caption": "Instagram caption in Greek with emojis, max 150 chars",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10"],
  "canvaInstructions": "Step by step Canva instructions in Greek: dimensions 1080x1080, colors ${colorLabel}, text to add, style"
}

The idea is: ${idea}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('[approve] Claude raw response:', text.slice(0, 200))

    const parsed = parseClaudeJson(text)
    console.log('[approve] parsed keys:', parsed ? Object.keys(parsed) : 'null')

    if (parsed) {
      content = {
        socialText: parsed.socialText || FALLBACK,
        caption: parsed.caption || FALLBACK,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        canvaInstructions: parsed.canvaInstructions || FALLBACK,
      }
    } else {
      console.warn('[approve] could not parse Claude JSON')
    }
  } catch (e) {
    console.error('[approve] Claude API error:', e)
  }

  return (
    <ApproveClient
      agent={{ id: agent.id, name: agent.name, color: agent.color, initials: agent.initials }}
      idea={idea}
      content={content}
    />
  )
}
