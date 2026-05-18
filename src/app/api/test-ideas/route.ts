import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('pending_ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[test-ideas] supabase error:', error)
      return Response.json({ ok: false, error: error.message, code: error.code }, { status: 500 })
    }

    return Response.json({ ok: true, count: data?.length ?? 0, rows: data })
  } catch (e) {
    console.error('[test-ideas] threw:', e)
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
