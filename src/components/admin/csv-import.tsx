"use client";

import { useState } from "react";
import { Upload, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
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
import type { CsvPreviewRow, CsvImportResult } from "@/types";

type Step = "upload" | "preview" | "processing" | "results";

export function CsvImport() {
  const [step, setStep] = useState<Step>("upload");
  const [importType, setImportType] = useState<"riders" | "adults">("riders");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CsvPreviewRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [result, setResult] = useState<CsvImportResult | null>(null);
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
      setPreview(data.preview);

      // Extract column names from first row's data
      if (data.preview.length > 0) {
        setColumns(Object.keys(data.preview[0].data));
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
      const res = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: csvText, import_type: importType }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Import failed");
        setStep("preview");
        return;
      }

      const data: CsvImportResult = await res.json();
      setResult(data);
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
    setColumns([]);
    setResult(null);
  }

  const createCount = preview.filter((r) => r.action === "create").length;
  const updateCount = preview.filter((r) => r.action === "update").length;
  const skipCount = preview.filter((r) => r.action === "skip").length;

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
              onValueChange={(v) => setImportType(v as "riders" | "adults")}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="riders">Riders (Minors)</SelectItem>
                <SelectItem value="adults">Adults</SelectItem>
              </SelectContent>
            </Select>

            <div className="text-xs text-muted-foreground">
              {importType === "riders" ? (
                <p>
                  Columns: first_name, last_name, date_of_birth, group_name,
                  parent_emails
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
      {step === "preview" && (
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

      {/* Results Step */}
      {step === "results" && result && (
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
