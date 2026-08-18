"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { formatUsd } from "@/lib/types";

interface WithdrawalStatusToastProps {
  withdrawal: {
    id: string;
    amountUsd: number;
    status: string;
  } | null;
}

export function WithdrawalStatusToast({ withdrawal }: WithdrawalStatusToastProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!withdrawal || !["approved", "rejected"].includes(withdrawal.status)) return;

    const key = `preket:withdrawal-notified:${withdrawal.id}:${withdrawal.status}`;
    if (sessionStorage.getItem(key)) return;

    sessionStorage.setItem(key, "1");
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 7000);
    return () => window.clearTimeout(timer);
  }, [withdrawal]);

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [router]);

  if (!visible || !withdrawal) return null;

  const approved = withdrawal.status === "approved";

  return (
    <div className="fixed right-4 top-20 z-[100] w-[min(380px,calc(100vw-2rem))] rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        {approved ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">
            Withdrawal {approved ? "approved" : "rejected"}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {approved
              ? `${formatUsd(withdrawal.amountUsd)} has been approved. The admin will send the funds to your wallet.`
              : `${formatUsd(withdrawal.amountUsd)} was rejected. Your funds have been refunded.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 text-zinc-500 hover:text-white"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
