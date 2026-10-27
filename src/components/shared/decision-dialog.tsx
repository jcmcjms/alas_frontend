import { useState, type ReactNode } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { ApiError, getErrorMessage } from "@/lib/api/api-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"

export interface DecisionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** One plain sentence stating the consequence the officer is accountable for. */
  consequence: string
  /** Record identifier line shown above the consequence (LAM ID, client). */
  subject?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Extra summary content (diffs, checklists) rendered before the remarks field. */
  children?: ReactNode
  remarksLabel?: string
  remarksRequired?: boolean
  remarksMinLength?: number
  remarksPlaceholder?: string
  pending: boolean
  /** Error from the last failed attempt; shown inside the dialog, input preserved. */
  error: unknown
  onConfirm: (remarks: string) => void
  destructive?: boolean
}

/**
 * Confirmation for consequential workflow actions (spec §14/§15): states the
 * record, the consequence, collects required remarks, blocks double submits,
 * and keeps user input when the mutation fails.
 */
export function DecisionDialog({
  open,
  onOpenChange,
  title,
  consequence,
  subject,
  confirmLabel,
  cancelLabel = "Cancel",
  children,
  remarksLabel = "Remarks",
  remarksRequired = false,
  remarksMinLength = 0,
  remarksPlaceholder = "Visible to the next reviewer and stored in the application history",
  pending,
  error,
  onConfirm,
  destructive = false,
}: DecisionDialogProps) {
  const [remarks, setRemarks] = useState("")
  const [attempted, setAttempted] = useState(false)

  // Reset transient state when the dialog transitions to open (render-time
  // "adjusting state" pattern — no effect). Remarks survive a failed submit
  // while the dialog stays open, so no writing is ever lost.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setRemarks("")
      setAttempted(false)
    }
  }

  const minLength = Math.max(remarksMinLength, 10)
  const tooShort = remarksRequired && remarks.trim().length < minLength

  function handleConfirm() {
    setAttempted(true)
    if (tooShort) return
    onConfirm(remarks.trim())
  }

  const apiError =
    error instanceof ApiError
      ? error
      : error
        ? new Error(getErrorMessage(error))
        : null
  const fieldErrors =
    apiError instanceof ApiError ? (apiError.fieldErrors.remarks ?? []) : []
  const showRemarksError = (attempted && tooShort) || fieldErrors.length > 0
  const showApiAlert = apiError != null && fieldErrors.length === 0

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              {subject ? (
                <div className="text-sm font-medium text-foreground">
                  {subject}
                </div>
              ) : null}
              <p>{consequence}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {children ? <div className="space-y-2 text-sm">{children}</div> : null}

        <div className="space-y-1.5">
          <Label htmlFor="decision-remarks">
            {remarksLabel}
            {remarksRequired ? (
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            ) : (
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            )}
          </Label>
          <Textarea
            id="decision-remarks"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder={remarksPlaceholder}
            rows={3}
            aria-invalid={showRemarksError}
            aria-describedby={
              showRemarksError ? "decision-remarks-error" : undefined
            }
            disabled={pending}
          />
          {showRemarksError ? (
            <p
              id="decision-remarks-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {fieldErrors[0] ??
                `Remarks of at least ${minLength} characters are required.`}
            </p>
          ) : null}
          {remarksRequired ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {remarks.trim().length} / {minLength} characters minimum
            </p>
          ) : null}
        </div>

        {showApiAlert && apiError ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{getErrorMessage(apiError)}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
            className={cn("gap-1.5")}
          >
            {pending ? (
              <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
            ) : null}
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
