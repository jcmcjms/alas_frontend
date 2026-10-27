import type { UseFormReturn } from "react-hook-form"
import { FileCheckIcon, FileWarningIcon } from "lucide-react"

import type { DocumentTemplateItem } from "@/features/loans/api/cis.api"
import type { LoanCreateFormValues } from "@/features/loans/schemas/loan-create.schema"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

/**
 * Step 3 — required documents. The encoder confirms which requirements are
 * physically on hand. Missing items are recorded honestly on the application
 * (they surface as "Missing" in the checklist and can be flagged by review);
 * nothing is silently marked complete.
 */
export function DocumentsStep({
  form,
  template,
}: {
  form: UseFormReturn<LoanCreateFormValues>
  template: DocumentTemplateItem[]
}) {
  const held = form.watch("documentsHeld") ?? []
  const missing = template.filter((doc) => !held.includes(doc.code))

  function toggle(code: string, checked: boolean) {
    const current = new Set(form.getValues("documentsHeld") ?? [])
    if (checked) current.add(code)
    else current.delete(code)
    form.setValue("documentsHeld", [...current], { shouldDirty: true })
  }

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          Required documents
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {held.length} of {template.length} on hand
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {template.map((doc) => {
            const isHeld = held.includes(doc.code)
            return (
              <li key={doc.code}>
                <div
                  className={cn(
                    "flex items-start gap-2.5 border px-3 py-2.5",
                    isHeld
                      ? "border-border bg-card"
                      : "border-dashed bg-muted/30"
                  )}
                >
                  <Checkbox
                    id={`doc-${doc.code}`}
                    checked={isHeld}
                    onCheckedChange={(checked) =>
                      toggle(doc.code, checked === true)
                    }
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor={`doc-${doc.code}`}
                    className="min-w-0 flex-1 font-normal"
                  >
                    <span className="block text-sm leading-snug">
                      {doc.name}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {doc.code}
                    </span>
                  </Label>
                  {isHeld ? (
                    <FileCheckIcon
                      aria-label="On hand"
                      className="size-4 flex-none text-emerald-600 dark:text-emerald-400"
                    />
                  ) : (
                    <FileWarningIcon
                      aria-label="Missing"
                      className="size-4 flex-none text-amber-600 dark:text-amber-400"
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {missing.length > 0 ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <FileWarningIcon aria-hidden className="size-4" />
            <AlertDescription className="text-xs">
              {missing.length} document{missing.length === 1 ? "" : "s"} will be
              recorded as missing on the application (
              {missing.map((doc) => doc.code).join(", ")}). The reviewer may
              return it as incomplete — upload the files later from the
              application page, or record a deviation with justification where
              policy allows.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <FileCheckIcon aria-hidden className="size-4" />
            <AlertDescription className="text-xs">
              All required documents are on hand. The application will be marked
              documents-complete.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
