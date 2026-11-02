-- Email change with verification, plus a log of unexpected server errors for the admin health page.
CREATE TABLE email_change_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_email  CITEXT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_change_tokens_hash_unique UNIQUE (token_hash)
);
CREATE INDEX email_change_tokens_user_idx ON email_change_tokens (user_id);

CREATE TABLE system_error_logs (
  id         BIGSERIAL PRIMARY KEY,
  method     VARCHAR(10),
  path       VARCHAR(200),
  message    VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX system_error_logs_created_idx ON system_error_logs (created_at DESC);
