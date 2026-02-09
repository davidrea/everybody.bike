"use client";

import { useQuery } from "@tanstack/react-query";

export function useMyRollModelGroupIds(
  userId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["my-roll-model-groups", userId],
    enabled: enabled && !!userId,
    queryFn: async (): Promise<string[]> => {
      const res = await fetch("/api/roll-model-groups/mine");
      if (!res.ok) throw new Error("Failed to fetch your roll model groups");
      return res.json();
    },
  });
}
