"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Share, Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "pwa-install-banner-dismissed-v1";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error - iOS Safari standalone
    window.navigator.standalone === true
  );
}

export function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [promptAvailable, setPromptAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setPromptAvailable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const shouldShow = useMemo(() => {
    if (dismissed) return false;
    if (isStandalone()) return false;
    if (isIos()) return true;
    return promptAvailable;
  }, [dismissed, promptAvailable]);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore storage errors.
    }
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      handleDismiss();
    }
  }

  if (!shouldShow) return null;

  const isIosPrompt = isIos();

  return (
    <div className="border-b bg-amber-50/80 px-4 py-3 text-amber-950 backdrop-blur dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50">
      <div className="mx-auto flex w-full max-w-4xl items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
          {isIosPrompt ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </div>
        <div className="flex-1 text-sm">
          <p className="font-semibold">
            {isIosPrompt ? "Enable notifications on iOS" : "Install Everybody.Bike"}
          </p>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
            {isIosPrompt ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <span>iOS Safari only allows push notifications for apps added to your Home Screen.</span>
                <span>Tap</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  <MoreHorizontal className="h-3 w-3" />
                  More
                </span>
                <span>then</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  <Share className="h-3 w-3" />
                  Share
                </span>
                <span>then “Add to Home Screen.”</span>
              </span>
            ) : (
              "Install the app for faster access and push notifications."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isIosPrompt ? (
            <div className="hidden items-center gap-1 text-xs text-amber-900/80 dark:text-amber-200/80 sm:flex">
              <span className="relative flex items-center gap-1">
                <Share className="h-4 w-4 animate-bounce" />
                <span>Add to Home Screen</span>
              </span>
            </div>
          ) : (
            <Button size="sm" onClick={handleInstall}>
              Install
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
