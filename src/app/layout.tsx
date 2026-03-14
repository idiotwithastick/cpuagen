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
    "The first AI platform where every response is validated, safety-enforced, and permanently cached. Bring your own LLM. We make it honest.",
  keywords: [
    "AI enforcement",
    "AI safety",
    "LLM orchestration",
    "AI validation",
    "CPUAGEN",
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
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}} />
      </body>
    </html>
  );
}
