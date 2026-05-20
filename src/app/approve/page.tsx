export const dynamic = 'force-dynamic'

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
    hashtags: [] as string[] | string,
    canvaInstructions: FALLBACK,
  }

  const styleContext: Record<string, string> = {
    'level-up': `
BRAND VOICE — Level Up Education (φροντιστήριο στην Ξάνθη, www.levelupeducation.gr):
- Θερμός, φιλικός, επαγγελματικός — ποτέ πιεστικός
- Σύντομες, δυνατές γραμμές — όχι μεγάλα μπλοκ κειμένου
- Λίγα emojis (μόνο όπου ταιριάζουν φυσικά)
- Πάντα στα Ελληνικά
- Hashtags: mix ελληνικών + αγγλικών, πάντα #LevelUpEducation και #Ξάνθη ή #Xanthi

POST STRUCTURE:
1. Hook — σύντομη πρώτη γραμμή: ερώτηση, δήλωση ή συναισθηματικό άνοιγμα
2. Κυρίως μήνυμα — 1-2 προτάσεις για την υπηρεσία ή τη δράση
3. Οφέλη — bullets με παύλες (-) ή ✅, ΠΟΤΕ asterisks (*)
4. CTA — μαλακό: "Επικοινώνησε μαζί μας" / "Κλείσε θέση τώρα" / "Μάθε περισσότερα"
5. Hashtags

REAL EXAMPLES (match this exact style):

Example 1 — Urgency / ΑΣΕΠ:
"Οι πίνακες εκπαιδευτικών ΑΣΕΠ ανοίγουν αρχές Μαΐου… και πολλοί θα χάσουν μόρια την τελευταία στιγμή.

Αν δεν έχεις ήδη πιστοποίηση πληροφορικής, τότε χάνεις ένα σημαντικό πλεονέκτημα.

Η πιστοποίηση μπορεί να σου δώσει έως και +4 μόρια και να σε ανεβάσει σημαντικά στους πίνακες.

Στο Level Up Education σε βοηθάμε να την αποκτήσεις γρήγορα και σωστά, με ταχύρυθμα μαθήματα που σε προετοιμάζουν άμεσα για τις εξετάσεις.

Επικοινώνησε μαζί μου τώρα για να προλάβεις πριν ανοίξουν οι αιτήσεις.

#ΑΣΕΠ #ΠίνακεςΕκπαιδευτικών #ΠιστοποίησηΠληροφορικής #LevelUpEducation #Xanthi"

Example 2 — Καμπάνια μαθημάτων (question hook + bullets):
"Θέλεις να μάθεις AutoCAD και να αποκτήσεις μια δεξιότητα που ζητείται στην αγορά εργασίας;

Στο Level Up Education ξεκινούν καλοκαιρινά μαθήματα AutoCAD με πιστοποίηση, ειδικά σχεδιασμένα για όσους θέλουν να μάθουν πρακτικά, οργανωμένα και σε σύντομο χρονικό διάστημα.

Το πρόγραμμα είναι ιδανικό για:
- φοιτητές
- μαθητές τεχνικών ειδικοτήτων
- μηχανικούς, αρχιτέκτονες, σχεδιαστές

Οι εγγραφές είναι ανοιχτές έως 09/05.
Επικοινώνησε μαζί μας για πληροφορίες και κράτηση θέσης.

#LevelUpEducation #AutoCAD #Πιστοποίηση #Ξάνθη #SummerCourses"

Example 3 — Awareness / Κοινοτικό (emotional hook):
"Οι νέοι της Ξάνθης έχουν φωνή και αξίζει να ακούγεται.

Το Level Up Education στηρίζει το διήμερο συνέδριο του Xanthi City Lab, μια σημαντική πρωτοβουλία που δίνει στους μαθητές της πόλης τη δυνατότητα να παρουσιάσουν ιδέες, να συνεργαστούν και να προτείνουν λύσεις για το μέλλον της Ξάνθης.

Δείτε περισσότερα στο άρθρο μας: [link]

#LevelUpEducation #XanthiCityLab #Xanthi #Education #YouthInnovation"

Example 4 — Εποχιακό / Αργία:
"Το Level Up Education σας εύχεται Καλό Πάσχα με υγεία, χαρά και όμορφες στιγμές!

Σας ενημερώνουμε ότι το φροντιστήριο θα παραμείνει κλειστό λόγω εορτών από 06/04 έως 18/04.

Θα είμαστε ξανά κοντά σας με γεμάτη ενέργεια μετά τις γιορτές!

#LevelUpEducation #KaloPasxa #Xanthi"`,

    pigiota: `
BRAND VOICE — pigiota314.gr (digital agency στην Ξάνθη, https://pigiota314.gr):
Ιδιοκτήτης: Γιάννης Κιμούντρης | info@pigiota314.gr | +30 697 594 6984

POSITIONING (κρίσιμο — πάντα να αντικατοπτρίζεται):
Η pigiota314 ΔΕΝ είναι "απλά digital marketing". Κατασκευάζει ιστοσελίδες, web εφαρμογές και SaaS λύσεις για επιχειρήσεις. Αυτή η ιεραρχία να φαίνεται και στο περιεχόμενο.

TONE RULES:
- Owner-led: σαν ο Γιάννης να μιλάει προσωπικά — αυθεντικό, όχι corporate
- Επαγγελματικό αλλά ζεστό — ποτέ κρύο ή generic
- Δείχνει πραγματική δουλειά και πραγματικά αποτελέσματα
- Strategic CTAs — ποτέ aggressive, πάντα conversational
- Λίγα emojis (1-3 max, μόνο όπου ταιριάζουν)
- Hashtags: English professional + #pigiota314 πάντα

POST STRUCTURE — Portfolio / Project showcase:
1. Hook — "Νέο project" ή strong value statement (π.χ. "Δεν είναι απλά ένα website")
2. Περιγραφή — τι υλοποιήθηκε, για ποιον και γιατί μετράει
3. Deliverables — bullets με ✔️ (σύγχρονο design, SEO, mobile, branding κλπ)
4. CTA — soft, personal: "Στείλε μας μήνυμα να το δούμε μαζί" ή "Δες το project: [link]"
5. Hashtags — #WebDesign #SEO #DigitalMarketing #pigiota314 #BusinessGrowth

POST STRUCTURE — Value / Agency post:
1. Hook — ερώτηση ή bold statement για επιχειρήσεις
2. Εξήγηση — γιατί αυτό μετράει στην πράξη (π.χ. leads, εμπιστοσύνη, SEO)
3. CTA — χαλαρό: "Ίσως ήρθε η ώρα να το ξαναδούμε 😉" ή "pigiota314.gr"
4. Hashtags

POST STRUCTURE — SaaS / App post:
1. Hook — το πρόβλημα που λύνει το app
2. Λύση — τι χτίστηκε και για ποιον κλάδο
3. CTA — "Έχεις ιδέα για app; Ας μιλήσουμε."
4. Hashtags — #SaaS #WebApp #pigiota314

REAL EXAMPLES (match this exact style):

Example 1 — Portfolio showcase (IliasTech):
"🚀 Νέο Website Project για επαγγελματία τεχνικό!

Στην pigiota314, δημιουργήσαμε την online παρουσία του IliasTech, ενός πιστοποιημένου τεχνικού service, με στόχο την αξιοπιστία, την ταχύτητα και τη μετατροπή επισκεπτών σε πελάτες.

💡 Τι υλοποιήσαμε:
✔️ Σύγχρονο & mobile-friendly design
✔️ Δομή που οδηγεί σε άμεση επικοινωνία
✔️ SEO-ready περιεχόμενο
✔️ Καθαρό επαγγελματικό branding
✔️ Στρατηγική προβολής υπηρεσιών

🎯 Έχεις επιχείρηση και θέλεις website που φέρνει πελάτες;
Στείλε μας μήνυμα να το δούμε μαζί.

#WebDesign #SEO #DigitalMarketing #Portfolio #pigiota314 #BusinessGrowth"

Example 2 — Value hook:
"🔥 Δεν είναι απλά ένα website. Είναι εργαλείο πωλήσεων.

Ένα σωστά δομημένο website μπορεί να:
✔️ χτίσει εμπιστοσύνη
✔️ εξηγήσει ξεκάθαρα υπηρεσίες
✔️ φέρει πραγματικά leads

💬 Αν το website σου δεν σου φέρνει πελάτες… ίσως ήρθε η ώρα να το ξαναδούμε 😉

#WebDesign #LeadGeneration #pigiota314 #DigitalMarketing"

Example 3 — SaaS / app angle:
"Κάθε κλάδος έχει ανάγκη από ένα εργαλείο που λύνει ένα συγκεκριμένο πρόβλημα.

Rantevo, SalonPilot, Physio — SaaS apps που φτιάξαμε από το μηδέν για salons, beauty centers και φυσικοθεραπευτές.

Έχεις ιδέα για app ή θέλεις να αυτοματοποιήσεις κάτι στην επιχείρησή σου;
Ας μιλήσουμε. pigiota314.gr

#SaaS #WebApp #pigiota314 #DigitalProducts"`,
  }

  const agentStyle = styleContext[pending.agent_id] ?? ''

  try {
    console.log('[approve] calling Claude API')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `You are a Greek social media content creator for the brand "${agent.name}". Based on this idea, generate content. You MUST respond with ONLY a valid JSON object, no markdown, no explanation, just the JSON:
{
  "socialText": "ready to post Greek social media text, 2-4 short paragraphs, no markdown asterisks (*), written exactly in the style and structure shown in the examples below",
  "caption": "Instagram caption in Greek with emojis, max 150 chars",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8", "hashtag9", "hashtag10"],
  "canvaInstructions": "Step by step Canva instructions in Greek: dimensions 1080x1080, colors ${colorLabel}, text to add, style"
}
${agentStyle}

RULES for socialText:
- Short, punchy lines — no walls of text
- Use - (dash) or ✅ for bullets, NEVER asterisks (*)
- End with a soft CTA or open question
- Match the hook → message → benefits → CTA → hashtags structure from the examples above
- Write as if Γιάννης Κιμούντρης is posting personally

The idea is: ${idea}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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
        hashtags: (parsed.hashtags as string[] | string) ?? [],
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
