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
        detail="Ο πίνακας pending_ideas μπορεί να μην έχει δημιουργηθεί ακόμα, ή ο σύνδεσμος έχει λήξει."
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
    social_text: idea, // fallback: raw idea text
    instagram_caption: '',
    hashtags: [] as string[],
    canva_instructions: '',
  }

  try {
    console.log('[approve] calling Claude API')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `Ο agent "${agent.name}" (${agent.description}) πρότεινε την ακόλουθη ιδέα:

"${idea}"

Δημιούργησε περιεχόμενο social media γι' αυτή την ιδέα. Απάντησε ΜΟΝΟ με έγκυρο JSON χωρίς markdown blocks, στο format:
{
  "social_text": "Κείμενο 2-3 παράγραφοι έτοιμο για δημοσίευση στα Ελληνικά",
  "instagram_caption": "Instagram caption με emojis στα Ελληνικά",
  "hashtags": ["#ελληνικό1", "#english2", "#ελληνικό3"],
  "canva_instructions": "Οδηγίες για Canva στα Ελληνικά: τι να σχεδιαστεί, διαστάσεις 1080x1080 για Instagram, χρώματα ${colorLabel}, τι κείμενο να μπει στο γραφικό"
}

Τα hashtags να είναι 10 συνολικά, mix ελληνικών και αγγλικών.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: agent.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('[approve] Claude response length:', text.length)

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1))
      content = { ...content, ...parsed }
    } else {
      console.warn('[approve] Claude did not return valid JSON, using raw idea as fallback')
    }
  } catch (e) {
    console.error('[approve] Claude API error:', e)
    // content already has idea as social_text fallback
  }

  return (
    <ApproveClient
      agent={{ id: agent.id, name: agent.name, color: agent.color, initials: agent.initials }}
      idea={idea}
      content={content}
    />
  )
}
