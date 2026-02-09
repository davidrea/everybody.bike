import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Upload, Bell } from "lucide-react";
import Link from "next/link";

const adminSections = [
  {
    title: "User Management",
    description: "Manage users, roles, and invitations",
    icon: Users,
    href: "/admin/users",
  },
  {
    title: "Invite Users",
    description: "Send invitations to new members",
    icon: UserPlus,
    href: "/admin/users",
  },
  {
    title: "CSV Import",
    description: "Bulk import riders and adults",
    icon: Upload,
    href: "/admin/import",
  },
  {
    title: "Notifications",
    description: "Schedule and send push notifications",
    icon: Bell,
    href: "/admin/notifications",
  },
];

export default function AdminPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">Club management tools</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {adminSections.map((section) => (
            <Link key={section.title} href={section.href}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
