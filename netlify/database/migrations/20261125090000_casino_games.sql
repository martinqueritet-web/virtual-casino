-- Mines, Roulette et Plinko
CREATE TABLE mines_games (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE game_stats
  ADD COLUMN mines_rounds      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN mines_net         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN mines_best_mult   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN roulette_spins    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN roulette_net      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN plinko_drops      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN plinko_net        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN plinko_best_mult  NUMERIC(10, 2) NOT NULL DEFAULT 0;
