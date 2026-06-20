CREATE TABLE IF NOT EXISTS pending_messages (
  id UUID PRIMARY KEY,
  from_user VARCHAR(255),
  to_user VARCHAR(255) NOT NULL,
  cipher TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
