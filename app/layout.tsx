import type { Metadata } from "next";
import { Suspense } from "react";
import { Instrument_Serif, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { CompareTray } from "@/components/compare-tray";
import { ThemeScript } from "@/components/theme-script";
import { AuthProvider } from "@/lib/auth/context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Scout — what's actually in your basket",
  description:
    "Honest grocery intel for India. We read the back label so you don't have to — verdicts, swaps, and what to skip.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "Scout",
    description: "Honest grocery intel for India.",
    type: "website",
  },
  // X needs an explicit card type to render the large link card on the launch post.
  twitter: {
    card: "summary_large_image",
    title: "Scout — what's actually in your basket",
    description:
      "We read the back label so you don't have to. Honest grocery intel for India.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${instrumentSerif.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Suspense fallback={null}>
            <CompareTray />
          </Suspense>
        </AuthProvider>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
