'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'unauthorized') {
      setError('Μη εξουσιοδοτημένος χρήστης')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createSupabaseBrowser()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#111827]">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <span className="text-lg font-bold text-white">AI</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Giannis Agents</h1>
        </div>

        {sent ? (
          <p className="text-center text-sm text-white/70">Ελέγξτε το email σας</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-white/20 py-3 text-sm font-medium text-white transition-colors hover:bg-white/30 disabled:opacity-50"
            >
              {loading ? '...' : 'Αποστολή magic link'}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  )
}
