import {
  Activity,
  BadgeCheck,
  Globe2,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

const STATS = [
  { label: "Global Users", value: "50K+", icon: Users, accent: "text-blue-400" },
  { label: "Daily Active", value: "18K+", icon: Activity, accent: "text-emerald-400" },
  { label: "Countries", value: "120+", icon: Globe2, accent: "text-violet-400" },
  { label: "Uptime", value: "99.9%", icon: Zap, accent: "text-amber-400" },
] as const;

const AUDITORS = ["CertiK", "Trail of Bits", "OpenZeppelin", "Halborn", "Chainalysis"] as const;

const MARQUEE_ITEMS = [
  "50,000+ traders worldwide",
  "Independently audited smart infrastructure",
  "Enterprise-grade encryption",
  "18,000+ daily active users",
  "Multi-chain settlement",
  "Institutional-grade security",
  "Real-time market engine",
  "Trusted across 120+ countries",
] as const;

export function MarketingTopBar() {
  return (
    <div className="border-b border-indigo-500/20 bg-gradient-to-r from-indigo-950/90 via-blue-950/80 to-emerald-950/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-xs sm:text-sm">
        <span className="text-zinc-300">Trusted by 50,000+ users worldwide</span>
        <span className="hidden text-zinc-500 md:inline">·</span>
        <span className="hidden items-center gap-1 text-indigo-200 md:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" />
          Independently audited
        </span>
      </div>
    </div>
  );
}

export function MarketingHeroStats() {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-4">
      {STATS.map(({ label, value, icon: Icon, accent }) => (
        <div
          key={label}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.05]"
        >
          <Icon className={`mb-2 h-5 w-5 ${accent}`} />
          <p className="text-2xl font-black tracking-tight text-white">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function MarketingTrustStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-950/30 px-4 py-3 ${className}`}
    >
      <TrustPill icon={<Users className="h-3.5 w-3.5" />} text="50K+ users" />
      <TrustPill icon={<Activity className="h-3.5 w-3.5" />} text="18K+ daily active" />
      <TrustPill icon={<Lock className="h-3.5 w-3.5" />} text="AES-256 encryption" />
      <TrustPill icon={<BadgeCheck className="h-3.5 w-3.5" />} text="Audited infrastructure" />
    </div>
  );
}

export function MarketingAuditorBadges() {
  return (
    <div className="mx-auto max-w-4xl px-4 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Security reviewed by industry leaders
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {AUDITORS.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-indigo-500/40 hover:text-white"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MarketingMarquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <div className="relative overflow-hidden border-y border-[var(--card-border)] bg-zinc-950/50 py-3">
      <div className="marketing-marquee flex w-max gap-10 whitespace-nowrap text-sm text-zinc-500">
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MarketingAuthTrust() {
  return (
    <div className="mt-8 space-y-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4">
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-indigo-300">
        Join 50,000+ traders worldwide
      </p>
      <div className="grid grid-cols-2 gap-2 text-center text-xs text-zinc-400">
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="font-bold text-white">18K+</p>
          <p>Daily active users</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="font-bold text-white">120+</p>
          <p>Countries served</p>
        </div>
      </div>
      <p className="text-center text-[11px] leading-relaxed text-zinc-500">
        Enterprise-grade crypto infrastructure · Independently audited · Bank-level security
      </p>
    </div>
  );
}

export function MarketingHighlightCards() {
  const cards = [
    {
      title: "Enterprise Crypto Stack",
      body: "Military-grade encryption, hardened key management, and best-in-class cryptographic protocols powering every transaction.",
      icon: Lock,
      gradient: "from-blue-500/10 to-indigo-500/5",
    },
    {
      title: "Independently Audited",
      body: "Reviewed by top-tier security firms. Continuous monitoring and rigorous compliance standards you can trust.",
      icon: ShieldCheck,
      gradient: "from-emerald-500/10 to-teal-500/5",
    },
    {
      title: "Global Community",
      body: "50,000+ registered users across 120+ countries. 10,000–20,000 traders active every single day.",
      icon: Globe2,
      gradient: "from-violet-500/10 to-purple-500/5",
    },
  ] as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">Why Preket</p>
        <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">Built for scale. Trusted globally.</h2>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {cards.map(({ title, body, icon: Icon, gradient }) => (
          <div
            key={title}
            className={`rounded-2xl border border-[var(--card-border)] bg-gradient-to-br ${gradient} p-6`}
          >
            <div className="mb-4 inline-flex rounded-xl bg-white/5 p-3">
              <Icon className="h-6 w-6 text-indigo-300" />
            </div>
            <h3 className="mb-2 font-semibold text-white">{title}</h3>
            <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrustPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
      {icon}
      {text}
    </span>
  );
}
