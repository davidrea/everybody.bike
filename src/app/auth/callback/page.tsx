"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const otpTypes = new Set(["magiclink", "invite", "recovery", "email", "email_change"]);

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    async function completeAuth() {
      const next = searchParams.get("next") ?? "/";
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      const hashParams = new URLSearchParams(
        window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash,
      );

      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");
      const hashTokenHash = hashParams.get("token_hash");
      const hashType = hashParams.get("type");

      let error: { message: string } | null = null;

      if (code) {
        const result = await supabase.auth.exchangeCodeForSession(code);
        error = result.error;
      } else if (tokenHash && type && otpTypes.has(type)) {
        const result = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "magiclink" | "invite" | "recovery" | "email" | "email_change",
        });
        error = result.error;
      } else if (hashTokenHash && hashType && otpTypes.has(hashType)) {
        const result = await supabase.auth.verifyOtp({
          token_hash: hashTokenHash,
          type: hashType as "magiclink" | "invite" | "recovery" | "email" | "email_change",
        });
        error = result.error;
      } else if (hashAccessToken && hashRefreshToken) {
        const result = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        });
        error = result.error;
      }

      if (error) {
        router.replace("/login?error=auth");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login?error=auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("invite_status")
        .eq("id", user.id)
        .single();

      if (profile?.invite_status === "pending") {
        router.replace("/onboarding");
        return;
      }

      router.replace(next);
    }

    void completeAuth();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
      Completing sign in...
    </div>
  );
}
