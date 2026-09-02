import type { Metadata } from "next";
import "./globals.css";
import { NavWrapper } from "@/components/nav-wrapper";

export const metadata: Metadata = {
  title: "RAG Eval",
  description: "Benchmark 5 RAG retrieval strategies in parallel. Know exactly what to ship.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth bg-neutral-950 text-neutral-50">
      <body className="min-h-screen antialiased">
        <NavWrapper />
        {children}
      </body>
    </html>
  );
}
