CREATE TABLE public.sync_state (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);
