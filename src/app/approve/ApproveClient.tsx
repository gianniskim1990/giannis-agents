'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Content {
  socialText: string
  caption: string
  hashtags: string[]
  canvaInstructions: string
}

interface AgentInfo {
  id: string
  name: string
  color: string
  initials: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
      style={{ background: copied ? '#16a34a' : '#374151', color: '#fff' }}
    >
      {copied ? '✓ Αντιγράφηκε' : 'Αντιγραφή'}
    </button>
  )
}

function Section({
  title,
  copyText,
  color,
  children,
}: {
  title: string
  copyText: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color }}>
          {title}
        </h2>
        <CopyButton text={copyText} />
      </div>
      <div className="text-sm leading-relaxed text-gray-300">{children}</div>
    </div>
  )
}

export default function ApproveClient({
  agent,
  idea,
  content,
}: {
  agent: AgentInfo
  idea: string
  content: Content
}) {
  const router = useRouter()
  const hashtagText = Array.isArray(content.hashtags) ? content.hashtags.join(' ') : ''

  return (
    <div className="min-h-screen bg-[#111827] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
        >
          ← Πίσω στην εφαρμογή
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: agent.color }}
          >
            {agent.initials}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Έγκριση Ιδέας — {agent.name}</h1>
            <p className="text-xs text-gray-500">Περιεχόμενο έτοιμο για δημοσίευση</p>
          </div>
        </div>

        <div
          className="mb-6 rounded-xl p-4"
          style={{ borderLeft: `4px solid ${agent.color}`, background: 'rgba(255,255,255,0.03)' }}
        >
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Ιδέα</p>
          <p className="text-sm text-gray-300">{idea}</p>
        </div>

        <Section title="📢 Κείμενο για Social Media" copyText={content.socialText} color={agent.color}>
          {content.socialText.split('\n').map((line, i) => (
            <p key={i} className={line === '' ? 'mt-3' : undefined}>
              {line || ' '}
            </p>
          ))}
        </Section>

        <Section title="📸 Instagram Caption" copyText={content.caption} color={agent.color}>
          <p className="whitespace-pre-wrap">{content.caption}</p>
        </Section>

        <Section title="🏷️ Hashtags" copyText={hashtagText} color={agent.color}>
          <div className="flex flex-wrap gap-2">
            {Array.isArray(content.hashtags) && content.hashtags.length > 0
              ? content.hashtags.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full px-3 py-1 text-xs"
                    style={{ background: `${agent.color}28`, color: agent.color }}
                  >
                    {tag}
                  </span>
                ))
              : <span className="text-gray-500">Δεν ήταν δυνατή η δημιουργία</span>}
          </div>
        </Section>

        <Section title="🎨 Οδηγίες Canva" copyText={content.canvaInstructions} color={agent.color}>
          <p className="whitespace-pre-wrap">{content.canvaInstructions}</p>
        </Section>
      </div>
    </div>
  )
}
