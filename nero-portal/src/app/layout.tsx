import type { Metadata } from "next";
import { Inter, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { PiiConsentGate } from "@/components/pii-consent-gate";

// Design system NEO (Locavia / "Venice by blite") — ver DESIGN.md §3.
// Inter = corpo/UI · Newsreader = display serif (títulos/ritual) · JetBrains Mono = dados.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portal Nero — Governança de Dados",
  description:
    "Portal de governança de dados do Data Lake LM, com o Nero (advisor DAMA-DMBOK2) como motor central.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopNav />
        {children}
        <PiiConsentGate />
      </body>
    </html>
  );
}
