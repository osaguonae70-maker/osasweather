-- OsasWeather core schema
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         VARCHAR(100) NOT NULL,
  email             CITEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  account_status    VARCHAR(20) NOT NULL DEFAULT 'active',
  email_verified_at TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_status_check CHECK (account_status IN ('active', 'suspended'))
);
CREATE INDEX users_created_at_idx ON users (created_at DESC);
CREATE INDEX users_status_idx ON users (account_status);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------- user_preferences
CREATE TABLE user_preferences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  temperature_unit VARCHAR(12) NOT NULL DEFAULT 'celsius',
  wind_speed_unit  VARCHAR(8)  NOT NULL DEFAULT 'kmh',
  default_location JSONB,
  theme            VARCHAR(8)  NOT NULL DEFAULT 'system',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_user_unique UNIQUE (user_id),
  CONSTRAINT user_preferences_temp_check CHECK (temperature_unit IN ('celsius', 'fahrenheit')),
  CONSTRAINT user_preferences_wind_check CHECK (wind_speed_unit IN ('kmh', 'mph', 'ms', 'kn')),
  CONSTRAINT user_preferences_theme_check CHECK (theme IN ('light', 'dark', 'system'))
);
CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------- favourite_locations
-- Coordinates are rounded to 4 decimals (~11 m) by the application so the
-- same place picked twice is caught by the unique constraint.
CREATE TABLE favourite_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  location_name VARCHAR(150) NOT NULL,
  country       VARCHAR(100),
  latitude      NUMERIC(9, 4) NOT NULL,
  longitude     NUMERIC(9, 4) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT favourite_locations_lat_check CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT favourite_locations_lon_check CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT favourite_locations_unique UNIQUE (user_id, latitude, longitude)
);
CREATE INDEX favourite_locations_user_idx ON favourite_locations (user_id, created_at DESC);

-- ------------------------------------------------ password_reset_tokens
CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_hash_unique UNIQUE (token_hash)
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- ------------------------------------------------------ administrators
-- A separate identity table: ordinary users can never be promoted into it.
-- The unique index on a constant expression allows AT MOST ONE row, ever,
-- which enforces the single-owner rule inside the database.
CREATE TABLE administrators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL,
  full_name     VARCHAR(100) NOT NULL DEFAULT 'Owner',
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'owner',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT administrators_email_unique UNIQUE (email),
  CONSTRAINT administrators_role_check CHECK (role = 'owner')
);
CREATE UNIQUE INDEX administrators_single_owner ON administrators ((TRUE));
CREATE TRIGGER administrators_set_updated_at BEFORE UPDATE ON administrators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------- sessions
-- Schema required by connect-pg-simple. Two physically separate tables keep
-- user and administrator sessions isolated.
CREATE TABLE user_sessions (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
CREATE INDEX user_sessions_user_idx ON user_sessions ((sess ->> 'userId'));

CREATE TABLE administrator_sessions (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX administrator_sessions_expire_idx ON administrator_sessions (expire);

-- ------------------------------------------------- admin_activity_logs
CREATE TABLE admin_activity_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  administrator_id UUID NOT NULL REFERENCES administrators (id) ON DELETE RESTRICT,
  action           VARCHAR(60) NOT NULL,
  target_type      VARCHAR(40),
  target_id        VARCHAR(64),
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_activity_logs_created_idx ON admin_activity_logs (created_at DESC);
CREATE INDEX admin_activity_logs_action_idx ON admin_activity_logs (action);

-- ---------------------------------------------------- api_request_logs
-- Real measurements of outbound weather/geocoding calls for admin monitoring.
CREATE TABLE api_request_logs (
  id          BIGSERIAL PRIMARY KEY,
  provider    VARCHAR(30) NOT NULL,
  endpoint    VARCHAR(30) NOT NULL,
  status_code INTEGER,
  success     BOOLEAN NOT NULL,
  cache_hit   BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER,
  error_code  VARCHAR(40),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_request_logs_created_idx ON api_request_logs (created_at DESC);

-- ------------------------------------------------------- app_settings
CREATE TABLE app_settings (
  key        VARCHAR(60) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
