import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  title: "Maxpar Panel Designer · Standard BioTools",
  description: "Design a metal-balanced CyTOF or IMC antibody panel from biology, not metals.",
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/sbt-logo.svg` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${montserrat.variable}`}>
      <body className="min-h-full bg-sbt-stone font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">{children}</body>
    </html>
  );
}
