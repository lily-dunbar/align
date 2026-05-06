import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Geist, Geist_Mono, Lora } from "next/font/google";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppHeader } from "@/components/app-header";
import { getDeveloperDemoModeForUser } from "@/lib/user-display-preferences";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const alignSerif = Lora({
  variable: "--font-align-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Align",
  description: "Metabolic intelligence app",
  icons: {
    icon: "/brand/align-icon.png",
    apple: "/brand/align-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();
  const userDemo = userId ? await getDeveloperDemoModeForUser(userId) : false;
  const devModeBanner = userDemo;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${alignSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background">
        <ClerkProvider>
          <AppHeader devModeBanner={devModeBanner} />
          <div className="flex min-h-0 flex-1 flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
            {children}
          </div>
          <AppBottomNav />
        </ClerkProvider>
      </body>
    </html>
  );
}
