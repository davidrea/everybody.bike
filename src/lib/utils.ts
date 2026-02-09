import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { zodResolver } from "@hookform/resolvers/zod"
import type { Resolver } from "react-hook-form"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Wrapper around zodResolver that handles Zod v4 + @hookform/resolvers type mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formResolver(schema: any): Resolver<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return zodResolver(schema) as any
}
