-- Baccara, Vidéo poker, Keno, Roue de la fortune
CREATE TABLE videopoker_games (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_stats
  ADD COLUMN baccarat_coups  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN baccarat_net    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN vp_hands        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN vp_net          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN vp_best         TEXT,
  ADD COLUMN vp_best_pays    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN keno_draws      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN keno_net        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN keno_best_hits  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN wheel_spins     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN wheel_net       INTEGER NOT NULL DEFAULT 0;
