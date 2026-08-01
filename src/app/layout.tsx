import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Bike Parts Shop OS — ShopMitra AI",
  description:
    "AI-powered bike spare parts shop management for rural Bihar. Natural language search, voice search, photo recognition, OCR invoice scanning, smart insights & predictions.",
  keywords: [
    "bike parts",
    "inventory",
    "spare parts",
    "rural shop",
    "stock management",
    "AI shop",
    "ShopMitra",
    "voice search",
    "OCR",
    "Bihar",
  ],
  authors: [{ name: "AI Bike Parts Shop OS" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-1024.png", type: "image/png", sizes: "1024x1024" },
    ],
    apple: [{ url: "/icon-1024.png", sizes: "1024x1024" }],
    shortcut: ["/favicon.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
