import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { LoginTransitionProvider } from "@/components/transitions/login-transition";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

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
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme");
  const initialTheme = themeCookie?.value === "light" ? "light" : "dark";

  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased font-sans bg-background-primary text-text-primary`}>
        <ThemeProvider initialTheme={initialTheme}>
          <LoginTransitionProvider>
            {children}
          </LoginTransitionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}