PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  imessage_handle TEXT NOT NULL,
  name TEXT,
  goal TEXT NOT NULL CHECK (goal IN ('cut', 'maintain', 'bulk')),
  weight_kg REAL NOT NULL,
  height_cm REAL NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('m', 'f')),
  activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  training_days_per_week INTEGER NOT NULL,
  daily_calorie_target INTEGER NOT NULL,
  daily_protein_target INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  description TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('text', 'photo', 'voice')),
  photo_path TEXT,
  raw_input TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meals_ts ON meals(ts);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  exercise TEXT NOT NULL,
  exercise_normalized TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  reps INTEGER NOT NULL,
  set_number INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  raw_input TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workouts_ts ON workouts(ts);
CREATE INDEX IF NOT EXISTS idx_workouts_exercise ON workouts(exercise_normalized, ts);

CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'coach')),
  content TEXT NOT NULL,
  has_image INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER,
  tokens_out INTEGER,
  model TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversations_ts ON conversations(ts);

CREATE TABLE IF NOT EXISTS sent_nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ts INTEGER NOT NULL,
  date_key TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nudges_kind_date_unique ON sent_nudges(kind, date_key);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
