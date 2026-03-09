import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CPUAGEN - Physics-Based AI Enforcement",
  description:
    "The first AI platform where every response is physics-validated, thermodynamically enforced, and permanently cached. Bring your own LLM. We make it honest.",
  keywords: [
    "AI enforcement",
    "physics-based AI",
    "LLM orchestration",
    "thermodynamic computing",
    "TEEP",
    "SSD-RCI",
  ],
  openGraph: {
    title: "CPUAGEN - Physics-Based AI Enforcement",
    description:
      "Every response physics-validated. Every answer permanently cached. Bring your own LLM.",
    url: "https://cpuagen.com",
    siteName: "CPUAGEN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
