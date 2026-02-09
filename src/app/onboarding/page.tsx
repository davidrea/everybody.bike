"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bike, KeyRound, Loader2, Plus, Trash2, ArrowRight } from "lucide-react";

interface MinorRider {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<"name" | "passkey" | "riders" | "done">("name");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [riders, setRiders] = useState<MinorRider[]>([{ firstName: "", lastName: "", dateOfBirth: "" }]);
  const [error, setError] = useState<string | null>(null);

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Check if user has parent role
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles")
      .eq("id", user.id)
      .single();

    setIsParent(profile?.roles?.includes("parent") ?? false);
    setStep("passkey");
    setLoading(false);
  }

  async function handlePasskeyRegister() {
    setLoading(true);
    setError(null);

    try {
      const optionsRes = await fetch("/api/auth/passkey/register");
      if (!optionsRes.ok) throw new Error("Failed to get registration options");
      const options = await optionsRes.json();

      const credential = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Registration failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey registration failed";
      if (!msg.includes("ceremony was cancelled") && !msg.includes("AbortError")) {
        setError(msg);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    if (isParent) {
      setStep("riders");
    } else {
      await completeOnboarding();
    }
  }

  function skipPasskey() {
    if (isParent) {
      setStep("riders");
    } else {
      completeOnboarding();
    }
  }

  function addRider() {
    setRiders([...riders, { firstName: "", lastName: "", dateOfBirth: "" }]);
  }

  function removeRider(index: number) {
    setRiders(riders.filter((_, i) => i !== index));
  }

  function updateRider(index: number, field: keyof MinorRider, value: string) {
    const updated = [...riders];
    updated[index] = { ...updated[index], [field]: value };
    setRiders(updated);
  }

  async function handleRidersSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Filter out empty riders
    const validRiders = riders.filter((r) => r.firstName.trim() && r.lastName.trim());

    for (const rider of validRiders) {
      const { data: newRider, error: riderError } = await supabase
        .from("riders")
        .insert({
          first_name: rider.firstName.trim(),
          last_name: rider.lastName.trim(),
          date_of_birth: rider.dateOfBirth || null,
        })
        .select("id")
        .single();

      if (riderError) {
        setError(`Failed to add ${rider.firstName}: ${riderError.message}`);
        setLoading(false);
        return;
      }

      // Link rider to parent
      const { error: linkError } = await supabase.from("rider_parents").insert({
        rider_id: newRider.id,
        parent_id: user.id,
        is_primary: true,
      });

      if (linkError) {
        setError(`Failed to link ${rider.firstName}: ${linkError.message}`);
        setLoading(false);
        return;
      }
    }

    await completeOnboarding();
  }

  async function completeOnboarding() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ invite_status: "accepted" })
        .eq("id", user.id);
    }
    router.push("/");
  }

  return (
    <div className="topo-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <Bike className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Welcome!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Let&apos;s get you set up for the ride.
          </p>
        </div>

        {step === "name" && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm your name</CardTitle>
              <CardDescription>This is how other members will see you.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  Continue
                </Button>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {step === "passkey" && (
          <Card>
            <CardHeader>
              <CardTitle>Set up a passkey</CardTitle>
              <CardDescription>
                Use your fingerprint, face, or device PIN for faster sign-in next time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handlePasskeyRegister} className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Register passkey
              </Button>
              <Button variant="ghost" className="w-full" onClick={skipPasskey}>
                Skip for now
              </Button>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {step === "riders" && (
          <Card>
            <CardHeader>
              <CardTitle>Add your riders</CardTitle>
              <CardDescription>
                Add the kids who&apos;ll be riding with the club. You can always add more later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRidersSubmit} className="space-y-4">
                {riders.map((rider, i) => (
                  <div key={i} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Rider {i + 1}</span>
                      {riders.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRider(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`first-${i}`}>First name</Label>
                        <Input
                          id={`first-${i}`}
                          value={rider.firstName}
                          onChange={(e) => updateRider(i, "firstName", e.target.value)}
                          placeholder="First"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`last-${i}`}>Last name</Label>
                        <Input
                          id={`last-${i}`}
                          value={rider.lastName}
                          onChange={(e) => updateRider(i, "lastName", e.target.value)}
                          placeholder="Last"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`dob-${i}`}>Date of birth</Label>
                      <Input
                        id={`dob-${i}`}
                        type="date"
                        value={rider.dateOfBirth}
                        onChange={(e) => updateRider(i, "dateOfBirth", e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                <Button type="button" variant="outline" className="w-full" onClick={addRider}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add another rider
                </Button>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  Finish setup
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={completeOnboarding}
                >
                  Skip for now
                </Button>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
