-- Kengaytma: gen_random_uuid() funksiyasi uchun
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE wants_role AS ENUM ('speaker', 'listener', 'both');
CREATE TYPE listener_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE session_kind AS ENUM ('video', 'audio', 'chat');
CREATE TYPE session_status AS ENUM ('scheduled', 'active', 'ended', 'cancelled');
CREATE TYPE report_reason AS ENUM ('abuse', 'inappropriate', 'other');

-- Har bir login usuli (Google/Telegram) shu jadvalga bog'lanadi
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE,
  google_id TEXT UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 2 AND 40),
  age_range TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'skip')),
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'uz' CHECK (language IN ('uz', 'ru')),
  city TEXT,
  wants wants_role NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE topics (
  code TEXT PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO topics (code, sort_order) VALUES
  ('family', 1), ('relationships', 2), ('work', 3), ('loneliness', 4),
  ('stress', 5), ('finance', 6), ('grief', 7), ('other', 8);

CREATE TABLE profile_topics (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_code TEXT REFERENCES topics(code),
  PRIMARY KEY (user_id, topic_code)
);

CREATE TABLE listener_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT NOT NULL CHECK (char_length(bio) <= 300),
  status listener_status NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  level TEXT NOT NULL DEFAULT 'listener' CHECK (level IN ('listener', 'experienced', 'professional')),
  rating_avg NUMERIC(2,1) NOT NULL DEFAULT 0,
  sessions_count INT NOT NULL DEFAULT 0,
  is_online BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID NOT NULL REFERENCES users(id),
  listener_id UUID NOT NULL REFERENCES users(id),
  kind session_kind NOT NULL DEFAULT 'video',
  status session_status NOT NULL DEFAULT 'scheduled',
  planned_duration_minutes INT NOT NULL DEFAULT 20,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE session_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rated_by UUID NOT NULL REFERENCES users(id),
  listened TEXT CHECK (listened IN ('yes', 'partial', 'no')),
  mood TEXT CHECK (mood IN ('worse', 'same', 'better', 'much_better')),
  stars INT CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  reported_by UUID NOT NULL REFERENCES users(id),
  reported_user UUID REFERENCES users(id),
  reason report_reason NOT NULL,
  details TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_listener_profiles_status ON listener_profiles (status);
CREATE INDEX idx_sessions_speaker ON sessions (speaker_id);
CREATE INDEX idx_sessions_listener ON sessions (listener_id);
