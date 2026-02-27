"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, HelpCircle, Copy, Check, RefreshCw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

async function fetchCalendarToken(): Promise<{ token: string }> {
  const res = await fetch("/api/calendar/token");
  if (!res.ok) throw new Error("Failed to load calendar token");
  return res.json();
}

async function regenerateCalendarToken(): Promise<{ token: string }> {
  const res = await fetch("/api/calendar/token", { method: "POST" });
  if (!res.ok) throw new Error("Failed to regenerate token");
  return res.json();
}

function buildUrls(token: string) {
  const host =
    typeof window !== "undefined" ? window.location.host : "everybody.bike";
  const feedPath = `/api/calendar/${token}`;
  const webcalUrl = `webcal://${host}${feedPath}`;
  const googleCalUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  return { webcalUrl, googleCalUrl };
}

export function CalendarFeedLinks() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", "token"],
    queryFn: fetchCalendarToken,
  });

  const regenerate = useMutation({
    mutationFn: regenerateCalendarToken,
    onSuccess: (newData) => {
      qc.setQueryData(["calendar", "token"], newData);
    },
  });

  if (isLoading || !data) return null;

  const { webcalUrl, googleCalUrl } = buildUrls(data.token);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(webcalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={webcalUrl}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Subscribe
      </a>
      <span className="text-xs text-muted-foreground/40">·</span>
      <a
        href={googleCalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Google
      </a>
      <Popover>
        <PopoverTrigger asChild>
          <button className="text-muted-foreground/50 transition-colors hover:text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="sr-only">Calendar subscription help</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 text-sm">
          <div className="space-y-3">
            <div>
              <p className="mb-1 font-medium">Subscribe to this calendar</p>
              <p className="text-xs text-muted-foreground">
                Your personal feed shows only your relevant events. The link is
                unique to you — keep it private.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium">Apple Calendar</p>
                <p className="text-muted-foreground">
                  Click <strong>Subscribe</strong>, or go to{" "}
                  <em>File → New Calendar Subscription</em> and paste the URL
                  below.
                </p>
              </div>
              <div>
                <p className="font-medium">Google Calendar</p>
                <p className="text-muted-foreground">
                  Click <strong>Google</strong>, or go to{" "}
                  <em>Other calendars → From URL</em> and paste the URL below.
                </p>
              </div>
              <div>
                <p className="font-medium">Other apps</p>
                <p className="text-muted-foreground">
                  Paste the URL below into any app that supports calendar
                  subscriptions (iCal / .ics format).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <code className="flex-1 truncate font-mono text-xs text-muted-foreground">
                {webcalUrl}
              </code>
              <button
                onClick={copyUrl}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="border-t pt-2">
              <button
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${regenerate.isPending ? "animate-spin" : ""}`}
                />
                {regenerate.isPending ? "Regenerating…" : "Regenerate link"}
              </button>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Invalidates the current URL and creates a new one.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
