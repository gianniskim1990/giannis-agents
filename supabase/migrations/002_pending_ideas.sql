CREATE TABLE pending_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  idea_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
