import { DepositForm } from "@/components/DepositForm";
import { MarketingTrustStrip } from "@/components/MarketingTrust";

export default function DepositPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Deposit</h1>
      <p className="text-[var(--muted)] mb-4">
        Choose network and asset, send to the deposit address, then paste your transaction hash.
        We verify on-chain before crediting USD balance.
      </p>
      <MarketingTrustStrip className="mb-8" />
      <DepositForm />
    </div>
  );
}
