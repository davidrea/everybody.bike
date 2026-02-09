"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bike, Mail, KeyRound, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(
      currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash,
    );

    const code = currentUrl.searchParams.get("code") ?? hashParams.get("code");
    const tokenHash =
      currentUrl.searchParams.get("token_hash") ?? hashParams.get("token_hash");
    const type = currentUrl.searchParams.get("type") ?? hashParams.get("type");
    const next = currentUrl.searchParams.get("next") ?? hashParams.get("next");

    if (code || (tokenHash && type)) {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (code) callbackUrl.searchParams.set("code", code);
      if (tokenHash && type) {
        callbackUrl.searchParams.set("token_hash", tokenHash);
        callbackUrl.searchParams.set("type", type);
      }
      if (next) callbackUrl.searchParams.set("next", next);
      window.location.replace(callbackUrl.toString());
      return;
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        window.location.replace("/");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        window.location.replace("/");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text: "Check your email for a magic link or 6-digit code to sign in.",
      });
      setShowOtp(true);
    }

    setLoading(false);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !otp) return;

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Signed in successfully." });
      window.location.replace("/");
    }

    setLoading(false);
  }

  async function handlePasskeyLogin() {
    setPasskeyLoading(true);
    setMessage(null);

    try {
      // Get authentication options from our API
      const optionsRes = await fetch("/api/auth/passkey/login");
      if (!optionsRes.ok) {
        throw new Error("Failed to get authentication options");
      }
      const options = await optionsRes.json();

      // Prompt user's authenticator
      const credential = await startAuthentication({ optionsJSON: options });

      // Verify with our API
      const verifyRes = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Passkey verification failed");
      }

      // On success, the verify endpoint sets the session cookie.
      // Redirect to home.
      window.location.href = "/";
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Passkey login failed";
      // Don't show errors for user cancellation
      if (!errorMessage.includes("ceremony was cancelled") && !errorMessage.includes("AbortError")) {
        setMessage({ type: "error", text: errorMessage });
      }
    }

    setPasskeyLoading(false);
  }

  return (
    <div className="topo-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <Bike className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">everybody.bike</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mountain bike club hub</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email for a magic link, or use your passkey.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="rider@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Send magic link
              </Button>
            </form>

            {showOtp && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">6-digit code</Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  Verify code
                </Button>
              </form>
            )}

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or
              </span>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
            >
              {passkeyLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Sign in with passkey
            </Button>

            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {message.text}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
