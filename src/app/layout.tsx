import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { LoginTransitionProvider } from "@/components/transitions/login-transition";

import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Easy Maintenance",
  description: "Plataforma de inteligência para manutenção industrial",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Ler a preferência do usuário do cookie
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme");
  const initialTheme = themeCookie?.value === "light" ? "light" : "dark";

  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}