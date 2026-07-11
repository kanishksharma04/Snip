import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Rejects protocol-relative ("//evil.com") and backslash ("/\evil.com") forms
// that some browsers still resolve as absolute — a relative-looking callbackUrl
// is not automatically a same-origin one.
export function isSafeRedirectPath(path: string | undefined | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}
