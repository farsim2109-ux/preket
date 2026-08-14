import {
  Bitcoin,
  Trophy,
  Landmark,
  Globe2,
  Cpu,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  emoji: string;
  gradient: string;
  accent: string;
  border: string;
  bg: string;
}

const DEFAULT_META: CategoryMeta = {
  label: "General",
  icon: TrendingUp,
  emoji: "📊",
  gradient: "from-blue-600/40 via-indigo-600/20 to-transparent",
  accent: "text-blue-400",
  border: "border-blue-500/30",
  bg: "bg-blue-500/10",
};

const CATEGORY_MAP: Record<string, Partial<CategoryMeta>> = {
  crypto: {
    label: "Crypto",
    icon: Bitcoin,
    emoji: "₿",
    gradient: "from-orange-500/50 via-amber-500/20 to-transparent",
    accent: "text-orange-400",
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
  },
  politics: {
    label: "Politics",
    icon: Landmark,
    emoji: "🏛️",
    gradient: "from-red-600/40 via-rose-500/20 to-transparent",
    accent: "text-red-400",
    border: "border-red-500/30",
    bg: "bg-red-500/10",
  },
  sports: {
    label: "Sports",
    icon: Trophy,
    emoji: "🏆",
    gradient: "from-emerald-600/40 via-green-500/20 to-transparent",
    accent: "text-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
  },
  world: {
    label: "World",
    icon: Globe2,
    emoji: "🌍",
    gradient: "from-cyan-600/40 via-teal-500/20 to-transparent",
    accent: "text-cyan-400",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
  },
  tech: {
    label: "Tech",
    icon: Cpu,
    emoji: "💻",
    gradient: "from-violet-600/40 via-purple-500/20 to-transparent",
    accent: "text-violet-400",
    border: "border-violet-500/30",
    bg: "bg-violet-500/10",
  },
  entertainment: {
    label: "Entertainment",
    icon: Sparkles,
    emoji: "🎬",
    gradient: "from-pink-600/40 via-fuchsia-500/20 to-transparent",
    accent: "text-pink-400",
    border: "border-pink-500/30",
    bg: "bg-pink-500/10",
  },
  general: DEFAULT_META,
};

export function getCategoryMeta(category: string): CategoryMeta {
  const key = category.toLowerCase().trim();
  const partial = CATEGORY_MAP[key] ?? {};
  return { ...DEFAULT_META, label: category, ...partial };
}

/** Polymarket-style cent display with tenths when needed (38.0¢, 62¢). */
export function probToCents(prob: number): string {
  const cents = Math.min(99.9, Math.max(0.1, prob * 100));
  const rounded = Math.round(cents * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}¢` : `${rounded.toFixed(1)}¢`;
}
