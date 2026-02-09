"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
  rider_group_id: string | null;
  avatar_url: string | null;
  invite_status: string;
  medical_alerts: string | null;
  media_opt_out: boolean;
}

interface AuthData {
  user: User | null;
  profile: Profile | null;
}

export function useAuth() {
  const qc = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async (): Promise<AuthData> => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return { user: null, profile: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const user = data?.user ?? null;
  const profile = data?.profile ?? null;

  const signOut = useCallback(async () => {
    await fetch("/api/auth/sign-out", { method: "POST" });
    qc.setQueryData(["auth", "me"], { user: null, profile: null });
    qc.invalidateQueries();
  }, [qc]);

  const hasRole = useCallback(
    (role: string) => {
      return profile?.roles?.includes(role) ?? false;
    },
    [profile],
  );

  const isAdmin = useCallback(() => {
    return hasRole("admin") || hasRole("super_admin");
  }, [hasRole]);

  return {
    user,
    profile,
    loading,
    signOut,
    hasRole,
    isAdmin,
  };
}
