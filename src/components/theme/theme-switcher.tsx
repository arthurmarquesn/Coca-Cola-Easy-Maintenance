"use client";

import React from "react";
import { useTheme } from "./theme-provider";
import { Moon, Sun } from "lucide-react";

export function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-md transition-colors hover:bg-surface-elevated text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring flex items-center justify-center"
      aria-label="Alternar tema"
      title={theme === "dark" ? "Mudar para Light Mode" : "Mudar para Dark Mode"}
    >
      {theme === "dark" ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
}
