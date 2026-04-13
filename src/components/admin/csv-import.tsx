"use client";

import { useState } from "react";
import { Upload, ArrowRight, CheckCircle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CsvPreviewTable } from "./csv-preview-table";
import { RootzPreviewTable } from "./rootz-preview-table";
import type { CsvPreviewRow, CsvImportResult, RootzPreviewRow, RootzImportResult } from "@/types";

type ImportType = "riders" | "adults" | "rootz_master";
type Step = "upload" | "preview" | "processing" | "results";

export function CsvImport() {
  const [step, setStep] = useState<Step>("upload");
  const [importType, setImportType] = useState<ImportType>("rootz_master");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CsvPreviewRow[]>([]);
  const [rootzPreview, setRootzPreview] = useState<RootzPreviewRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [rootzResult, setRootzResult] = useState<RootzImportResult | null>(null);
  const [parentNameOverrides, setParentNameOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  }

  async function handlePreview() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: csvText, import_type: importType }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Preview failed");
        return;
      }

      const data = await res.json();

      if (importType === "rootz_master") {
        setRootzPreview(data.preview);
      } else {
        setPreview(data.preview);
        if (data.preview.length > 0) {
          setColumns(Object.keys(data.preview[0].data));
        }
      }

      setStep("preview");
    } catch {
      toast.error("Failed to preview CSV");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    setStep("processing");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        csv_text: csvText,
        import_type: importType,
      };

      if (importType === "rootz_master") {
        body.parent_name_overrides = parentNameOverrides;
      }

      const res = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Import failed");
        setStep("preview");
        return;
      }

      if (importType === "rootz_master") {
        const data: RootzImportResult = await res.json();
        setRootzResult(data);
      } else {
        const data: CsvImportResult = await res.json();
        setResult(data);
      }
      setStep("results");
    } catch {
      toast.error("Import failed");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setStep("upload");
    setCsvText("");
    setFileName("");
    setPreview([]);
    setRootzPreview([]);
    setColumns([]);
    setResult(null);
    setRootzResult(null);
    setParentNameOverrides({});
  }

  // Counts for legacy import types
  const createCount = preview.filter((r) => r.action === "create").length;
  const updateCount = preview.filter((r) => r.action === "update").length;
  const skipCount = preview.filter((r) => r.action === "skip").length;

  // Counts for ROOTZ import
  const rootzAdultCreate = rootzPreview.filter((r) => r.classification === "adult_rider" && r.action === "create").length;
  const rootzAdultUpdate = rootzPreview.filter((r) => r.classification === "adult_rider" && r.action === "update").length;
  const rootzMinorCreate = rootzPreview.filter((r) => r.classification === "minor_rider" && r.action === "create").length;
  const rootzMinorUpdate = rootzPreview.filter((r) => r.classification === "minor_rider" && r.action === "update").length;
  const rootzSkip = rootzPreview.filter((r) => r.action === "skip").length;
  const rootzNewInvites = rootzPreview.filter((r) => r.parent_resolution === "new_invite").length;
  const rootzGuessedNames = rootzPreview.filter((r) => r.parent_name_guessed).length;
  const rootzActionable = rootzPreview.filter((r) => r.action !== "skip").length;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "processing", "results"] as Step[]).map(
          (s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              )}
              <span
                className={
                  step === s
                    ? "font-medium text-primary"
                    : "text-muted-foreground"
                }
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ),
        )}
      </div>

      {/* Upload Step */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={importType}
              onValueChange={(v) => setImportType(v as ImportType)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rootz_master">ROOTZ Master List</SelectItem>
                <SelectItem value="riders">Riders (Generic)</SelectItem>
                <SelectItem value="adults">Adults (Generic)</SelectItem>
              </SelectContent>
            </Select>

            <div className="text-xs text-muted-foreground">
              {importType === "rootz_master" ? (
                <div className="space-y-1">
                  <p>
                    Import the ROOTZ registration spreadsheet. Contains both adult
                    and youth riders in a single file.
                  </p>
                  <p className="flex items-start gap-1">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    Load Roll Models first (via the Adults import) so that
                    parent emails are matched to existing profiles.
                  </p>
                </div>
              ) : importType === "riders" ? (
                <p>
                  Columns: first_name, last_name, date_of_birth, group_name,
                  parent_emails, parent_names (optional)
                </p>
              ) : (
                <p>Columns: full_name, email, roles</p>
              )}
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-muted/50">
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {fileName || "Click to upload CSV file"}
              </span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <div className="flex justify-end">
              <Button
                onClick={handlePreview}
                disabled={!csvText || loading}
              >
                {loading ? "Processing..." : "Preview"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Step */}
      {step === "preview" && importType === "rootz_master" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-green-600">
              {rootzAdultCreate} adult riders to create
            </span>
            <span className="text-amber-600">
              {rootzAdultUpdate} adult riders to update
            </span>
            <span className="text-green-600">
              {rootzMinorCreate} minor riders to create
            </span>
            <span className="text-amber-600">
              {rootzMinorUpdate} minor riders to update
            </span>
            {rootzNewInvites > 0 && (
              <span className="text-blue-600">
                {rootzNewInvites} new parent invites
              </span>
            )}
            {rootzSkip > 0 && (
              <span className="text-red-600">
                {rootzSkip} will be skipped
              </span>
            )}
          </div>

          {rootzGuessedNames > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {rootzGuessedNames} parent name(s) were guessed from emergency
                contacts or email addresses. Review and correct them in the
                table below before importing.
              </p>
            </div>
          )}

          <RootzPreviewTable
            rows={rootzPreview}
            parentNameOverrides={parentNameOverrides}
            onParentNameChange={(email, name) =>
              setParentNameOverrides((prev) => ({ ...prev, [email]: name }))
            }
          />

          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <p>
              Groups are not assigned during import. After import, assign
              riders to groups from the Groups management page.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleReset}>
              Start Over
            </Button>
            <Button
              onClick={handleCommit}
              disabled={rootzActionable === 0}
            >
              Import {rootzActionable} Records
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && importType !== "rootz_master" && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">
              {createCount} to create
            </span>
            <span className="text-amber-600">
              {updateCount} to update
            </span>
            {skipCount > 0 && (
              <span className="text-red-600">
                {skipCount} will be skipped (errors)
              </span>
            )}
          </div>

          <CsvPreviewTable rows={preview} columns={columns} />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleReset}>
              Start Over
            </Button>
            <Button
              onClick={handleCommit}
              disabled={createCount + updateCount === 0}
            >
              Import {createCount + updateCount} Records
            </Button>
          </div>
        </div>
      )}

      {/* Processing Step */}
      {step === "processing" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-sm text-muted-foreground">
              Importing records...
            </p>
            <Progress value={50} className="w-48" />
          </CardContent>
        </Card>
      )}

      {/* Results Step — ROOTZ */}
      {step === "results" && importType === "rootz_master" && rootzResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>Adult Riders Created: {rootzResult.adult_riders_created}</div>
              <div>Adult Riders Updated: {rootzResult.adult_riders_updated}</div>
              <div>Minor Riders Created: {rootzResult.minor_riders_created}</div>
              <div>Minor Riders Updated: {rootzResult.minor_riders_updated}</div>
              <div>Parents Created: {rootzResult.parents_created}</div>
              <div>Invites Sent: {rootzResult.invites_sent}</div>
              <div>Skipped: {rootzResult.skipped}</div>
            </div>

            {rootzResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {rootzResult.errors.length} error(s)
                </p>
                <ul className="list-inside list-disc text-xs text-destructive">
                  {rootzResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
              Next step: Go to Groups to assign imported riders to their groups.
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleReset}>Import More</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Step — Legacy */}
      {step === "results" && importType !== "rootz_master" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>Created: {result.created}</div>
              <div>Updated: {result.updated}</div>
              <div>Skipped: {result.skipped}</div>
              <div>Invites Sent: {result.invites_sent}</div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {result.errors.length} error(s)
                </p>
                <ul className="list-inside list-disc text-xs text-destructive">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleReset}>Import More</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
