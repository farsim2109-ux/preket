"use client";

import { useCallback, useEffect, useState } from "react";
import { BetForm } from "@/components/BetForm";
import { createClient } from "@/lib/supabase/client";
import { netPositions } from "@/lib/positions";

type Props = {
  eventId: string;
  balance: number;
  yesPool: number;
  noPool: number;
  cpmmRy: number;
  cpmmRn: number;
  yesCpmmPerPm: number;
  noCpmmPerPm: number;
  yesShares: number;
  noShares: number;
};

export function LiveBetForm(props: Props) {
  const [positions, setPositions] = useState({ yes: props.yesShares, no: props.noShares });

  const refreshPositions = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("bets")
      .select("outcome, trade_type, shares")
      .eq("event_id", props.eventId)
      .eq("user_id", auth.user.id)
      .eq("status", "active");
    if (!error) setPositions(netPositions(data ?? []));
  }, [props.eventId]);

  useEffect(() => {
    void refreshPositions();
    const timer = window.setInterval(() => void refreshPositions(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshPositions]);

  return <BetForm {...props} yesShares={positions.yes} noShares={positions.no} />;
}
