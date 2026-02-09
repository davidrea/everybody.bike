"use client";

import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="topo-bg min-h-screen">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 pb-20 md:pb-0">
          <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
