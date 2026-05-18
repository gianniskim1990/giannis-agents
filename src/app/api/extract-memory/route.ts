import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const { conversation } = await request.json()

  if (!conversation) return Response.json([])

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:
        'Extract 1-3 key facts from this conversation that the agent should remember long-term. Return only a JSON array like: [{"key": "fact_name", "value": "fact_value"}]. Be concise. Only facts worth remembering.',
      messages: [{ role: 'user', content: conversation }],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '[]'

    const match = text.match(/\[[\s\S]*\]/)
    const facts = match ? JSON.parse(match[0]) : []
    return Response.json(Array.isArray(facts) ? facts : [])
  } catch {
    return Response.json([])
  }
}
