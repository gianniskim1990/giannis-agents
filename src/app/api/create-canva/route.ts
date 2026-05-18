import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: Request) {
  const { idea } = await request.json()
  if (!idea) return Response.json({ error: 'Missing idea' }, { status: 400 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.beta.messages as any).create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: [
        {
          type: 'url',
          url: 'https://mcp.canva.com/mcp',
          name: 'canva',
          authorization_token: process.env.CANVA_MCP_TOKEN,
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Create an Instagram post design in Canva for this business idea. Make it visually appealing with the key message as the focal point. After creating the design, reply with the Canva design URL only — no extra text.\n\nIdea: ${idea}`,
        },
      ],
    })

    // Extract Canva URL from any text block in the response
    let designUrl: string | null = null
    for (const block of response.content ?? []) {
      if (block.type === 'text') {
        const match = (block.text as string).match(
          /https:\/\/(?:www\.)?canva\.com\/design\/[^\s"')>]+/,
        )
        if (match) {
          designUrl = match[0].replace(/[.,;]+$/, '')
          break
        }
      }
    }

    if (!designUrl) {
      return Response.json(
        { error: 'Could not extract design URL from Canva response' },
        { status: 500 },
      )
    }

    return Response.json({ url: designUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
