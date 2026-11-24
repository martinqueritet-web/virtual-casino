-- VIRTUAL CASINO — schéma initial
-- Tous les montants sont des crédits virtuels (VC) fictifs, sans valeur monétaire.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '🎩',
  avatar_color  TEXT NOT NULL DEFAULT '#d4af37',
  prefs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_username_lower ON users (LOWER(username));

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE wallets (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance    INTEGER NOT NULL CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_tx (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  ref           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX wallet_tx_user ON wallet_tx (user_id, created_at DESC);

CREATE TABLE rooms (
  code       TEXT PRIMARY KEY,
  host_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX rooms_updated ON rooms (updated_at);

CREATE TABLE room_presence (
  room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_code, user_id)
);

CREATE TABLE blackjack_games (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE game_stats (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  poker_hands             INTEGER NOT NULL DEFAULT 0,
  poker_won               INTEGER NOT NULL DEFAULT 0,
  poker_showdowns         INTEGER NOT NULL DEFAULT 0,
  poker_showdowns_won     INTEGER NOT NULL DEFAULT 0,
  poker_vpip              INTEGER NOT NULL DEFAULT 0,
  poker_biggest_pot       INTEGER NOT NULL DEFAULT 0,
  poker_net               INTEGER NOT NULL DEFAULT 0,
  poker_best_rank         INTEGER NOT NULL DEFAULT -1,
  poker_best_label        TEXT,
  bj_rounds               INTEGER NOT NULL DEFAULT 0,
  bj_wins                 INTEGER NOT NULL DEFAULT 0,
  bj_losses               INTEGER NOT NULL DEFAULT 0,
  bj_pushes               INTEGER NOT NULL DEFAULT 0,
  bj_blackjacks           INTEGER NOT NULL DEFAULT 0,
  bj_net                  INTEGER NOT NULL DEFAULT 0,
  bj_practice_rounds      INTEGER NOT NULL DEFAULT 0,
  bj_practice_decisions   INTEGER NOT NULL DEFAULT 0,
  bj_practice_correct     INTEGER NOT NULL DEFAULT 0,
  slots_spins             INTEGER NOT NULL DEFAULT 0,
  slots_net               INTEGER NOT NULL DEFAULT 0,
  slots_biggest_win       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE game_history (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game       TEXT NOT NULL,
  result     TEXT NOT NULL,
  net        INTEGER NOT NULL,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX game_history_user ON game_history (user_id, created_at DESC);
