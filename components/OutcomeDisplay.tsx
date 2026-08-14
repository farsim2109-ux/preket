import { MarketOdds } from "@/components/MarketOdds";

/** Read-only live odds — same component as bet form for consistent prices. */
export function OutcomeDisplay({ yesProb, noProb }: { yesProb: number; noProb: number }) {
  return <MarketOdds yesProb={yesProb} noProb={noProb} size="lg" />;
}
