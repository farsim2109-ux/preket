-- Deposit token metadata + confirmed_at (keeps UUID users / existing status values)

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS token TEXT NOT NULL DEFAULT 'NATIVE',
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.credit_deposit(
  p_user_id UUID,
  p_network TEXT,
  p_tx_hash TEXT,
  p_amount_crypto NUMERIC,
  p_amount_usd NUMERIC,
  p_token TEXT DEFAULT 'NATIVE'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM deposits WHERE tx_hash = p_tx_hash) THEN
    RAISE EXCEPTION 'Transaction hash already used';
  END IF;

  INSERT INTO deposits (user_id, network, tx_hash, amount_crypto, amount_usd, status, token, confirmed_at)
  VALUES (p_user_id, p_network, p_tx_hash, p_amount_crypto, p_amount_usd, 'verified', COALESCE(p_token, 'NATIVE'), NOW())
  RETURNING id INTO v_deposit_id;

  UPDATE users SET balance_usd = balance_usd + p_amount_usd WHERE id = p_user_id;

  RETURN v_deposit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_deposit(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;
