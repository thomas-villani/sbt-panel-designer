import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maxpar Panel Designer (PD3 demo)",
  description: "Design a metal-balanced CyTOF or IMC antibody panel from biology, not metals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">{children}</body>
    </html>
  );
}
