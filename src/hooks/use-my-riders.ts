"use client";

import { useQuery } from "@tanstack/react-query";
import type { Rider } from "@/types";

export function useMyRiders(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-riders", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Rider[]> => {
      const res = await fetch("/api/riders/mine");
      if (!res.ok) throw new Error("Failed to fetch riders");
      return res.json();
    },
  });
}
