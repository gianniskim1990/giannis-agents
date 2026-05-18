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

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#111827]">
      <div className="text-center">
        <p className="mb-4 text-white">{message}</p>
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
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await searchParams

  if (!id) {
    return <ErrorPage message="Λείπει το αναγνωριστικό ιδέας." />
  }

  const { data: pending } = await supabase
    .from('pending_ideas')
    .select('agent_id, idea_text')
    .eq('id', id)
    .single()

  if (!pending) {
    return <ErrorPage message="Η ιδέα δεν βρέθηκε. Ίσως έχει λήξει ή ο σύνδεσμος είναι λανθασμένος." />
  }

  const agent = agents[pending.agent_id]
  const idea: string = pending.idea_text

  if (!agent) {
    return <ErrorPage message="Άγνωστος agent. Δεν ήταν δυνατή η φόρτωση της σελίδας." />
  }

  const colorLabel = colorLabels[pending.agent_id] ?? agent.color

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

  let content = {
    social_text: '',
    instagram_caption: '',
    hashtags: [] as string[],
    canva_instructions: '',
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: agent.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    const jsonText = start !== -1 && end !== -1 ? text.slice(start, end + 1) : '{}'
    content = JSON.parse(jsonText)
  } catch {
    content = {
      social_text: 'Σφάλμα κατά τη δημιουργία περιεχομένου. Παρακαλώ δοκιμάστε ξανά.',
      instagram_caption: '',
      hashtags: [],
      canva_instructions: '',
    }
  }

  return (
    <ApproveClient
      agent={{ id: agent.id, name: agent.name, color: agent.color, initials: agent.initials }}
      idea={idea}
      content={content}
    />
  )
}
