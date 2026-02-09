import { AppShell } from "@/components/layout/app-shell";
import { CsvImport } from "@/components/admin/csv-import";

export default function AdminImportPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            CSV Import
          </h1>
          <p className="text-muted-foreground">
            Bulk import riders and adults from CSV files
          </p>
        </div>
        <CsvImport />
      </div>
    </AppShell>
  );
}
