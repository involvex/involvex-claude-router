"use client";

import useThemeStore from "@/store/themeStore";
import { useEffect } from "react";

export function ThemeProvider({ children }) {
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return <>{children}</>;
}
