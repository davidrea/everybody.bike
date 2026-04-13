"use client";

import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { PwaInstallBanner } from "./pwa-install-banner";
import { NotificationPromptBanner } from "./notification-prompt-banner";

export function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="topo-bg min-h-screen">
      <Header />
      <PwaInstallBanner />
      <NotificationPromptBanner />
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-clip pb-20 md:pb-0">
          <div className={`mx-auto w-full px-4 py-6 print:max-w-none print:px-0 print:py-4 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
