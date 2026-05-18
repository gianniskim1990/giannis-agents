import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: type as any })

    if (!error && data.user) {
      const allowedEmail = process.env.NEXT_PUBLIC_ALLOWED_EMAIL
      if (allowedEmail && data.user.email !== allowedEmail) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=unauthorized', request.url))
      }
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid', request.url))
}
