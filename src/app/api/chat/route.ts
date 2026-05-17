import Anthropic from '@anthropic-ai/sdk'
import { agents } from '@/lib/agents'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  const { agentId, messages } = await request.json()

  const agent = agents[agentId]
  if (!agent) {
    return new Response('Agent not found', { status: 400 })
  }

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: agent.systemPrompt,
    messages: anthropicMessages,
  })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
