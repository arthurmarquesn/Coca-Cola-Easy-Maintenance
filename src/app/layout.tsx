import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { LoginTransitionProvider } from "@/components/transitions/login-transition";

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
  // Light é o padrão: só entra no dark se o usuário escolheu.
  const initialTheme = themeCookie?.value === "dark" ? "dark" : "light";

  return (
    <html lang="pt-BR" className={initialTheme}>
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
