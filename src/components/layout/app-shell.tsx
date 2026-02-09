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
        <main className="min-w-0 flex-1 overflow-x-clip pb-20 md:pb-0">
          <div className="mx-auto w-full max-w-4xl px-4 py-6 print:max-w-none print:px-0 print:py-4">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
