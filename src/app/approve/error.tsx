'use client'

export default function ApproveError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#111827]">
      <div className="max-w-md text-center">
        <p className="mb-2 text-white">Δεν ήταν δυνατή η δημιουργία του περιεχομένου.</p>
        {error.message && (
          <p className="mb-4 text-xs text-gray-500">{error.message}</p>
        )}
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-white/10 px-5 py-2 text-sm text-white transition-colors hover:bg-white/20"
          >
            Δοκιμάστε ξανά
          </button>
          <a
            href="/"
            className="rounded-xl bg-white/10 px-5 py-2 text-sm text-white transition-colors hover:bg-white/20"
          >
            ← Πίσω στην εφαρμογή
          </a>
        </div>
      </div>
    </div>
  )
}
