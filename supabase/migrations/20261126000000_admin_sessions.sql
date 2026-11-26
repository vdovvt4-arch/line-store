CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON public.admin_sessions (expires_at);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.admin_sessions TO service_role;
