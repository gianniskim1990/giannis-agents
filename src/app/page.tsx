'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Conversation, type Message, type AgentMemory } from '@/lib/supabase'
import { agentList, agents, type Agent } from '@/lib/agents'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { Send, Plus, MessageSquare, ChevronRight, LogOut } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const [activeAgent, setActiveAgent] = useState<Agent>(agentList[0])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isNewConv, setIsNewConv] = useState(false)
  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [memoryExpanded, setMemoryExpanded] = useState(false)
  const [isAddingMemory, setIsAddingMemory] = useState(false)
  const [newMemoryKey, setNewMemoryKey] = useState('')
  const [newMemoryValue, setNewMemoryValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadConversations(activeAgent.id)
    loadMemories(activeAgent.id)
    setActiveConvId(null)
    setMessages([])
    setIsNewConv(false)
  }, [activeAgent.id])

  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId)
  }, [activeConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function loadConversations(agentId: string) {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
    setConversations(data ?? [])
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
  }

  async function loadMemories(agentId: string) {
    const { data } = await supabase
      .from('agent_memory')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
    setMemories(data ?? [])
  }

  async function deleteMemory(id: string) {
    await supabase.from('agent_memory').delete().eq('id', id)
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  async function addMemory() {
    const key = newMemoryKey.trim()
    const value = newMemoryValue.trim()
    if (!key || !value) return
    const { data } = await supabase
      .from('agent_memory')
      .insert({ agent_id: activeAgent.id, memory_key: key, memory_value: value })
      .select()
      .single()
    if (data) setMemories((prev) => [data, ...prev])
    setNewMemoryKey('')
    setNewMemoryValue('')
    setIsAddingMemory(false)
  }

  async function extractAndSaveMemories(
    agentId: string,
    conversationLines: Array<{ role: string; content: string }>,
  ) {
    try {
      const conversation = conversationLines
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n')

      const res = await fetch('/api/extract-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation }),
      })

      if (!res.ok) return
      const facts: Array<{ key: string; value: string }> = await res.json()

      for (const fact of facts) {
        if (!fact.key || !fact.value) continue
        const { data } = await supabase
          .from('agent_memory')
          .insert({ agent_id: agentId, memory_key: fact.key, memory_value: fact.value })
          .select()
          .single()
        if (data) setMemories((prev) => [data, ...prev])
      }
    } catch {
      // non-critical
    }
  }

  function startNewConversation() {
    setActiveConvId(null)
    setMessages([])
    setIsNewConv(true)
    inputRef.current?.focus()
  }

  function selectConversation(conv: Conversation) {
    setActiveConvId(conv.id)
    setIsNewConv(false)
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput('')
    setIsStreaming(true)
    setStreamingText('')

    let convId = activeConvId

    if (!convId) {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ agent_id: activeAgent.id, title: text.slice(0, 60) })
        .select()
        .single()
      if (error || !conv) {
        setIsStreaming(false)
        return
      }
      convId = conv.id
      setActiveConvId(convId)
      setIsNewConv(false)
      setConversations((prev) => [conv, ...prev])
    }

    const { data: savedUser } = await supabase
      .from('messages')
      .insert({ conversation_id: convId, role: 'user', content: text })
      .select()
      .single()

    if (savedUser) {
      setMessages((prev) => [...prev, savedUser])
    }

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: activeAgent.id, messages: apiMessages }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreamingText(accumulated)
      }

      const { data: savedAssistant } = await supabase
        .from('messages')
        .insert({ conversation_id: convId, role: 'assistant', content: accumulated })
        .select()
        .single()

      setMessages((prev) => [
        ...prev,
        savedAssistant ?? {
          id: crypto.randomUUID(),
          conversation_id: convId!,
          role: 'assistant' as const,
          content: accumulated,
          created_at: new Date().toISOString(),
        },
      ])

      extractAndSaveMemories(activeAgent.id, [
        ...apiMessages,
        { role: 'assistant', content: accumulated },
      ])
    } catch {
      // keep partial streaming text if any
    } finally {
      setStreamingText('')
      setIsStreaming(false)
    }
  }

  async function handleLogout() {
    const auth = createSupabaseBrowser()
    await auth.auth.signOut()
    router.push('/login')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const showChat = activeConvId !== null || isNewConv

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <aside className="flex w-72 flex-shrink-0 flex-col bg-[#111827]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <span className="text-xs font-bold text-white">AI</span>
          </div>
          <span className="text-sm font-semibold text-white">Giannis Agents</span>
        </div>

        {/* Agent selector */}
        <div className="px-3 py-3">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-white/40">
            Agents
          </p>
          {agentList.map((agent) => {
            const isActive = activeAgent.id === agent.id
            return (
              <button
                key={agent.id}
                onClick={() => setActiveAgent(agents[agent.id])}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/10"
                style={{ backgroundColor: isActive ? `${agent.color}22` : undefined }}
              >
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.initials}
                </div>
                <div className="flex-1 text-left">
                  <p
                    className="text-sm font-medium"
                    style={{ color: isActive ? agent.color : '#e5e7eb' }}
                  >
                    {agent.name}
                  </p>
                  <p className="text-xs text-white/40 leading-tight">{agent.description}</p>
                </div>
                {isActive && (
                  <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: agent.color }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Memory panel */}
        <div className="px-3 pb-1">
          <button
            onClick={() => setMemoryExpanded((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/40 transition-colors hover:bg-white/10 hover:text-white/60"
          >
            <span className="font-medium uppercase tracking-wider">Μνήμη 🧠</span>
            <ChevronRight
              className="h-3 w-3 transition-transform"
              style={{ transform: memoryExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </button>

          {memoryExpanded && (
            <div className="mt-1 space-y-1">
              {memories.length === 0 && !isAddingMemory && (
                <p className="px-2 py-1 text-xs text-white/25">Καμία μνήμη ακόμα</p>
              )}
              {memories.map((mem) => (
                <div
                  key={mem.id}
                  className="flex items-start gap-1.5 rounded-md bg-white/5 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-white/60">{mem.memory_key}: </span>
                    <span className="text-xs text-white/40">{mem.memory_value}</span>
                  </div>
                  <button
                    onClick={() => deleteMemory(mem.id)}
                    className="flex-shrink-0 text-white/20 transition-colors hover:text-white/60"
                    title="Διαγραφή"
                  >
                    ×
                  </button>
                </div>
              ))}

              {isAddingMemory ? (
                <div className="space-y-1 pt-1">
                  <input
                    value={newMemoryKey}
                    onChange={(e) => setNewMemoryKey(e.target.value)}
                    placeholder="Κλειδί"
                    className="w-full rounded-md bg-white/10 px-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:bg-white/15"
                  />
                  <input
                    value={newMemoryValue}
                    onChange={(e) => setNewMemoryValue(e.target.value)}
                    placeholder="Τιμή"
                    className="w-full rounded-md bg-white/10 px-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:bg-white/15"
                    onKeyDown={(e) => e.key === 'Enter' && addMemory()}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={addMemory}
                      className="flex-1 rounded-md bg-white/10 py-1 text-xs text-white/70 transition-colors hover:bg-white/20"
                    >
                      ✓ Αποθήκευση
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingMemory(false)
                        setNewMemoryKey('')
                        setNewMemoryValue('')
                      }}
                      className="rounded-md bg-white/5 px-2 py-1 text-xs text-white/40 transition-colors hover:bg-white/10"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingMemory(true)}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/10 hover:text-white/60"
                >
                  <Plus className="h-3 w-3" />
                  Προσθήκη
                </button>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-white/10" />

        {/* New conversation button */}
        <div className="px-3 py-3">
          <button
            onClick={startNewConversation}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-4 w-4" />
            Νέα Συνομιλία
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {conversations.length > 0 && (
            <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-white/40">
              Ιστορικό
            </p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv)}
              className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10"
              style={{
                backgroundColor: activeConvId === conv.id ? `${activeAgent.color}22` : undefined,
              }}
            >
              <MessageSquare
                className="h-3.5 w-3.5 flex-shrink-0"
                style={{ color: activeConvId === conv.id ? activeAgent.color : '#6b7280' }}
              />
              <span
                className="truncate text-sm"
                style={{
                  color: activeConvId === conv.id ? activeAgent.color : '#9ca3af',
                }}
              >
                {conv.title}
              </span>
            </button>
          ))}
        </div>
        {/* Logout */}
        <div className="px-3 py-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
          >
            <LogOut className="h-4 w-4" />
            Αποσύνδεση
          </button>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {showChat ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: activeAgent.color }}
              >
                {activeAgent.initials}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{activeAgent.name} Agent</p>
                <p className="text-xs text-gray-400">{activeAgent.description}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-gray-400">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
                    style={{ backgroundColor: activeAgent.color }}
                  >
                    {activeAgent.initials}
                  </div>
                  <p className="text-sm">Γειά σου! Πώς μπορώ να σε βοηθήσω;</p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: activeAgent.color }}
                    >
                      {activeAgent.initials}
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                      Εσύ
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-gray-100 text-gray-900 rounded-tr-sm'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Streaming bubble */}
              {isStreaming && (
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: activeAgent.color }}
                  >
                    {activeAgent.initials}
                  </div>
                  <div className="max-w-[70%] rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm whitespace-pre-wrap">
                    {streamingText || (
                      <span className="flex gap-1 py-1">
                        <span
                          className="h-2 w-2 rounded-full animate-bounce"
                          style={{ backgroundColor: activeAgent.color, animationDelay: '0ms' }}
                        />
                        <span
                          className="h-2 w-2 rounded-full animate-bounce"
                          style={{ backgroundColor: activeAgent.color, animationDelay: '150ms' }}
                        />
                        <span
                          className="h-2 w-2 rounded-full animate-bounce"
                          style={{ backgroundColor: activeAgent.color, animationDelay: '300ms' }}
                        />
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-gray-100 px-6 py-4">
              <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 focus-within:border-gray-300 focus-within:bg-white transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Γράψε ένα μήνυμα… (Enter για αποστολή)"
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
                  style={{ maxHeight: '120px' }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement
                    t.style.height = 'auto'
                    t.style.height = t.scrollHeight + 'px'
                  }}
                  disabled={isStreaming}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: activeAgent.color }}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-gray-400">
                Shift+Enter για νέα γραμμή
              </p>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <div className="flex gap-4">
              {agentList.map((agent) => (
                <div
                  key={agent.id}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.initials}
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Giannis Agents</h2>
              <p className="mt-1 text-sm text-gray-400">
                Επίλεξε έναν agent και ξεκίνα μια νέα συνομιλία
              </p>
            </div>
            <button
              onClick={startNewConversation}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: activeAgent.color }}
            >
              <Plus className="h-4 w-4" />
              Νέα Συνομιλία με {activeAgent.name}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
