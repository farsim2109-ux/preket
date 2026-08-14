-- Admin-only fake liquidity injection (boosts displayed volume + CPMM depth)

CREATE OR REPLACE FUNCTION public.admin_add_liquidity(
  p_event_id UUID,
  p_yes_usd NUMERIC,
  p_no_usd NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_ry NUMERIC;
  v_rn NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF COALESCE(p_yes_usd, 0) < 0 OR COALESCE(p_no_usd, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts must be non-negative';
  END IF;

  IF COALESCE(p_yes_usd, 0) = 0 AND COALESCE(p_no_usd, 0) = 0 THEN
    RAISE EXCEPTION 'Enter at least one side amount';
  END IF;

  SELECT status, cpmm_ry, cpmm_rn
  INTO v_status, v_ry, v_rn
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Event is not active';
  END IF;

  v_ry := GREATEST(50, COALESCE(v_ry, 500) + COALESCE(p_yes_usd, 0));
  v_rn := GREATEST(50, COALESCE(v_rn, 500) + COALESCE(p_no_usd, 0));

  UPDATE public.events
  SET cpmm_ry = v_ry, cpmm_rn = v_rn
  WHERE id = p_event_id;

  PERFORM public.sync_event_pools_from_cpmm(p_event_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_liquidity(UUID, NUMERIC, NUMERIC) TO authenticated;
