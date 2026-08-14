import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavbarShell } from "@/components/NavbarShell";
import { MarketingTopBar } from "@/components/MarketingTrust";

const inter = Inter({ subsets: ["latin"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preket — Prediction Markets",
  description: "Trade on real-world outcomes. No gas fees. Instant settlement.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <MarketingTopBar />
        <NavbarShell />
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </body>
    </html>
  );
}
