-- Tables de poker solo contre des bots (une par joueur)
CREATE TABLE solo_poker (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
