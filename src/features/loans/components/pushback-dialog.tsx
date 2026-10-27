import { useState } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { ApiError, getErrorMessage } from "@/lib/api/api-error"
import { REVISION_SECTION_LABELS } from "@/features/loans/schemas/loan-create.schema"
import type { RevisionSectionId } from "@/features/loans/types/loan-contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const SECTIONS: RevisionSectionId[] = [
  "client-info",
  "loan-params",
  "obligations",
  "deviations",
  "documents",
  "verification",
]

/**
 * Return-for-correction dialog: the reviewer names the affected sections and
 * what must change. The encoder sees exactly this feedback on the correction
 * screen (spec §6).
 */
export function PushbackDialog({
  open,
  onOpenChange,
  lamId,
  clientName,
  pending,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lamId: string
  clientName: string
  pending: boolean
  error: unknown
  onConfirm: (payload: {
    sections: { sectionId: RevisionSectionId; comments: string }[]
    overallComments: string
  }) => void
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [overall, setOverall] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  function reset() {
    setSelected({})
    setOverall("")
    setLocalError(null)
  }

  const apiError = error instanceof ApiError ? error : null
  const sectionFieldErrors = apiError?.fieldErrors.sections ?? []
  const overallFieldErrors = apiError?.fieldErrors.overallComments ?? []

  function handleConfirm() {
    const sections = Object.entries(selected)
      .filter(([, comments]) => comments.trim().length > 0)
      .map(([sectionId, comments]) => ({
        sectionId: sectionId as RevisionSectionId,
        comments: comments.trim(),
      }))
    if (sections.length === 0) {
      setLocalError(
        "Select at least one section and describe what must be corrected."
      )
      return
    }
    if (overall.trim().length < 10) {
      setLocalError("Summarize the return reason in at least 10 characters.")
      return
    }
    setLocalError(null)
    onConfirm({ sections, overallComments: overall.trim() })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next)
          if (!next) reset()
        }
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Return for correction</DialogTitle>
          <DialogDescription>
            {lamId} · {clientName}. The application leaves your queue and
            returns to the encoder with your feedback attached. Previous
            decisions are preserved.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">
            Affected sections
          </legend>
          {SECTIONS.map((sectionId) => {
            const checked = sectionId in selected
            return (
              <div key={sectionId} className="border border-border p-2.5">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id={`section-${sectionId}`}
                    checked={checked}
                    onCheckedChange={(value) => {
                      setSelected((current) => {
                        const next = { ...current }
                        if (value === true)
                          next[sectionId] = next[sectionId] ?? ""
                        else delete next[sectionId]
                        return next
                      })
                    }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor={`section-${sectionId}`}
                      className="font-normal"
                    >
                      {REVISION_SECTION_LABELS[sectionId] ?? sectionId}
                    </Label>
                    {checked ? (
                      <Textarea
                        value={selected[sectionId]}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [sectionId]: event.target.value,
                          }))
                        }
                        placeholder={`What must be corrected in “${REVISION_SECTION_LABELS[sectionId] ?? sectionId}”?`}
                        rows={2}
                        className="mt-1.5"
                        aria-label={`Correction details for ${REVISION_SECTION_LABELS[sectionId] ?? sectionId}`}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="pushback-overall">
            Overall reason{" "}
            <span aria-hidden className="text-destructive">
              *
            </span>
          </Label>
          <Textarea
            id="pushback-overall"
            value={overall}
            onChange={(event) => setOverall(event.target.value)}
            placeholder="One summary the encoder sees first (min 10 characters)"
            rows={2}
            disabled={pending}
          />
        </div>

        {localError ? (
          <p role="alert" className="text-xs text-destructive">
            {localError}
          </p>
        ) : null}
        {sectionFieldErrors.length + overallFieldErrors.length > 0 ? (
          <p role="alert" className="text-xs text-destructive">
            {[...sectionFieldErrors, ...overallFieldErrors].join(" ")}
          </p>
        ) : null}
        {apiError &&
        sectionFieldErrors.length + overallFieldErrors.length === 0 ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Return failed</AlertTitle>
            <AlertDescription>{getErrorMessage(apiError)}</AlertDescription>
          </Alert>
        ) : null}
        {error && !(error instanceof ApiError) ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Return failed</AlertTitle>
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              reset()
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? (
              <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
            ) : null}
            {pending ? "Returning…" : "Return to encoder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
