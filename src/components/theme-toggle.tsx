"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

function subscribe() {
  return () => {};
}
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes can't know the real theme until after hydration (it reads
  // localStorage/system preference client-side) — rendering an icon before
  // that would either flash the wrong one or mismatch the server-rendered
  // markup. useSyncExternalStore's server/client snapshot split gives a
  // reliable "have we hydrated yet" without setState-in-an-effect.
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-hidden className="opacity-0" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
    </Button>
  );
}
