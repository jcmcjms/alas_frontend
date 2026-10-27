import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  FileWarningIcon,
  MessageSquareWarningIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useProductOptions } from "@/features/admin/products/api/products.api"
import { useDeviationCatalog } from "@/features/loans/api/cis.api"
import {
  useLoanDetail,
  useRemoveDocument,
  useReviseLoan,
  useRevisionRequests,
  useUploadDocument,
} from "@/features/loans/api/loans.queries"
import { computeLoanTotals } from "@/features/loans/model/loan-computations"
import { REVISION_SECTION_LABELS } from "@/features/loans/schemas/loan-create.schema"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/shared/page-header"
import { DetailSkeleton, ErrorState } from "@/components/shared/state-views"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { StatusBadge } from "@/components/shared/status-badge"
import { SectionCard } from "@/features/loans/components/review-panels"

const reviseSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(4, "State the loan purpose (min 4 characters).")
    .max(200),
  proposedAmount: z
    .number({ message: "Enter the loan amount." })
    .int()
    .positive(),
  termDays: z.number({ message: "Enter the term in days." }).int().positive(),
  annualRatePercent: z.number({ message: "Enter the rate." }).min(0).max(30),
  resolutionNotes: z
    .string()
    .trim()
    .min(
      10,
      "Describe what you corrected (min 10 characters) — the reviewer reads this first."
    )
    .max(1000),
})

type ReviseFormValues = z.infer<typeof reviseSchema>

/**
 * Correction screen (spec §6): shows every piece of reviewer feedback with its
 * author and stage, lets the encoder fix the affected fields and documents,
 * and resubmits to the stage the backend designates. Previous decisions are
 * preserved and shown, never erased.
 */
export function LoanRevisePage() {
  const { loanId = "" } = useParams()
  const navigate = useNavigate()
  const detail = useLoanDetail(loanId)
  const revisions = useRevisionRequests(loanId)
  const catalog = useDeviationCatalog()
  const productsData = useProductOptions()
  const revise = useReviseLoan(loanId)
  const upload = useUploadDocument(loanId)
  const removeDoc = useRemoveDocument(loanId)

  const loan = detail.data
  const [serverError, setServerError] = useState<string | null>(null)
  const [pendingCode, setPendingCode] = useState("")
  const [pendingJustification, setPendingJustification] = useState("")
  const [deviationError, setDeviationError] = useState<string | null>(null)
  const [deviations, setDeviations] = useState<
    { code: string; justification: string }[] | null
  >(null)

  const form = useForm<ReviseFormValues>({
    resolver: zodResolver(reviseSchema),
    values: useMemo(
      () =>
        loan
          ? {
              purpose: loan.purpose ?? "",
              proposedAmount: loan.proposedAmount,
              termDays: loan.termDays,
              annualRatePercent: loan.annualRatePercent,
              resolutionNotes: "",
            }
          : {
              purpose: "",
              proposedAmount: 0,
              termDays: 0,
              annualRatePercent: 0,
              resolutionNotes: "",
            },
      [loan]
    ),
  })

  if (detail.isPending) {
    return (
      <div className="p-6">
        <DetailSkeleton />
      </div>
    )
  }
  if (detail.isError || !loan) {
    return (
      <div className="p-6">
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
          title="Couldn't load this application"
        />
      </div>
    )
  }

  if (
    loan.status !== "ForRevision" &&
    loan.status !== "ForIncompleteDocuments"
  ) {
    return (
      <div className="p-6">
        <SectionCard title="No correction needed">
          <p className="text-sm">
            <span className="font-mono">{loan.lamId}</span> is{" "}
            <StatusBadge status={loan.status} className="align-middle" /> — it
            is not waiting for a correction.{" "}
            <Link
              to={`/loans/${loan.id}`}
              className="underline underline-offset-2"
            >
              Open the application
            </Link>
            .
          </p>
        </SectionCard>
      </div>
    )
  }

  const openRequests = (revisions.data?.items ?? []).filter(
    (revision) => !revision.isResolved
  )
  const pastRequests = (revisions.data?.items ?? []).filter(
    (revision) => revision.isResolved
  )
  const product = (productsData.data?.items ?? []).find(
    (candidate) => candidate.code === loan.productCode
  )
  const currentDeviations =
    deviations ??
    loan.deviations.map((entry) => ({
      code: entry.code,
      justification: entry.encoderJustification,
    }))
  const missingDocs = loan.documents.filter((doc) => doc.status === "Missing")

  const preview = product
    ? computeLoanTotals({
        principal: form.watch("proposedAmount") || 0,
        annualRatePercent: form.watch("annualRatePercent") || 0,
        termDays: form.watch("termDays") || 0,
        notarialFee: product.notarialFee,
        docStampFee: product.docStampFee,
        insuranceFee: product.insuranceFee,
        applicationChargeRate: product.applicationChargeRate,
      })
    : null

  function addDeviation() {
    setDeviationError(null)
    if (!pendingCode) return setDeviationError("Select the deviation reason.")
    if (pendingJustification.trim().length < 10)
      return setDeviationError("Justify the deviation (min 10 characters).")
    setDeviations([
      ...currentDeviations,
      { code: pendingCode, justification: pendingJustification.trim() },
    ])
    setPendingCode("")
    setPendingJustification("")
  }

  async function onSubmit(values: ReviseFormValues) {
    setServerError(null)
    try {
      await revise.mutateAsync({
        rowVersion: loan!.rowVersion,
        purpose: values.purpose,
        proposedAmount: values.proposedAmount,
        termDays: values.termDays,
        annualRatePercent: values.annualRatePercent,
        deviations: currentDeviations,
        resolutionNotes: values.resolutionNotes,
      })
      toast.success(`${loan!.lamId} resubmitted for review.`)
      navigate(`/loans/${loan!.id}`, { replace: true })
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Resubmission failed."
      )
    }
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={`Correct ${loan.lamId}`}
        description={
          <span>
            {loan.client.firstName} {loan.client.lastName} · returned{" "}
            {formatDateTime(loan.lastActionDate)} · resubmission returns to the
            stage that sent it back ({openRequests[0]?.fromStatus ?? "review"}).
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={`/loans/${loan.id}`}>View full application</Link>
          </Button>
        }
      />

      {/* Reviewer feedback — the reason this application came back. */}
      {loan.documentFlag ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <FileWarningIcon aria-hidden className="size-4" />
          <AlertTitle className="text-sm">
            Flagged: incomplete documents
          </AlertTitle>
          <AlertDescription className="text-xs">
            {loan.documentFlag.reason} — flagged{" "}
            {formatDateTime(loan.documentFlag.flaggedAt)} by{" "}
            {loan.documentFlag.flaggedByName ?? "the reviewer"} (
            {loan.documentFlag.missingCount} missing).
          </AlertDescription>
        </Alert>
      ) : null}

      {openRequests.map((request) => (
        <Alert
          key={request.id}
          className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <MessageSquareWarningIcon aria-hidden className="size-4" />
          <AlertTitle className="text-sm">
            Returned by {request.requestedByName} ({request.requestedByRole}) ·{" "}
            {formatDateTime(request.requestedAt)}
          </AlertTitle>
          <AlertDescription className="space-y-2 text-xs">
            <p>{request.overallComments}</p>
            <ul className="space-y-1.5">
              {request.sections.map((section, index) => (
                <li key={index} className="border-l-2 border-amber-400/60 pl-2">
                  <span className="font-medium">
                    {REVISION_SECTION_LABELS[section.sectionId] ??
                      section.sectionId}
                    :
                  </span>{" "}
                  {section.comments}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ))}

      {serverError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Resubmission failed</AlertTitle>
          <AlertDescription>
            {serverError} Your corrections are still on this page.
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm font-medium">
                Loan parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="purpose">Purpose</Label>
                <Input
                  id="purpose"
                  {...form.register("purpose")}
                  aria-invalid={Boolean(form.formState.errors.purpose)}
                />
                {form.formState.errors.purpose ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.purpose.message}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount (₱)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step={100}
                    className="tabular-nums"
                    {...form.register("proposedAmount", {
                      valueAsNumber: true,
                    })}
                    aria-invalid={Boolean(form.formState.errors.proposedAmount)}
                  />
                  {form.formState.errors.proposedAmount ? (
                    <p role="alert" className="text-xs text-destructive">
                      {form.formState.errors.proposedAmount.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="term">Term (days)</Label>
                  <Input
                    id="term"
                    type="number"
                    step={30}
                    className="tabular-nums"
                    {...form.register("termDays", { valueAsNumber: true })}
                    aria-invalid={Boolean(form.formState.errors.termDays)}
                  />
                  {form.formState.errors.termDays ? (
                    <p role="alert" className="text-xs text-destructive">
                      {form.formState.errors.termDays.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Rate (%/yr)</Label>
                  <Input
                    id="rate"
                    type="number"
                    step={0.5}
                    className="tabular-nums"
                    {...form.register("annualRatePercent", {
                      valueAsNumber: true,
                    })}
                    aria-invalid={Boolean(
                      form.formState.errors.annualRatePercent
                    )}
                  />
                  {form.formState.errors.annualRatePercent ? (
                    <p role="alert" className="text-xs text-destructive">
                      {form.formState.errors.annualRatePercent.message}
                    </p>
                  ) : null}
                </div>
              </div>
              {product &&
              (form.watch("proposedAmount") < product.minAmount ||
                form.watch("proposedAmount") > product.maxAmount) ? (
                <p role="alert" className="text-xs text-destructive">
                  {product.code} accepts ₱{product.minAmount.toLocaleString()}–₱
                  {product.maxAmount.toLocaleString()}.
                </p>
              ) : null}
              {preview &&
              Number.isFinite(preview.monthlyAmortization) &&
              preview.monthlyAmortization > 0 ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Recomputed: amortization{" "}
                  {formatCurrency(preview.monthlyAmortization)}/mo · net
                  proceeds {formatCurrency(preview.netProceeds)} (backend
                  recomputes authoritatively on save).
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm font-medium">
                Documents ({missingDocs.length} missing)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
              {missingDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every checklist requirement is uploaded.
                </p>
              ) : (
                missingDocs.map((doc) => (
                  <label
                    key={doc.code}
                    className="flex cursor-pointer items-center justify-between gap-2 border border-dashed px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs">{doc.name}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {doc.code} · PNG/JPEG/PDF, max 5 MB
                      </span>
                    </span>
                    <UploadIcon
                      aria-hidden
                      className="size-3.5 flex-none text-muted-foreground"
                    />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      className="sr-only"
                      disabled={upload.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ""
                        if (!file) return
                        if (
                          ![
                            "image/png",
                            "image/jpeg",
                            "application/pdf",
                          ].includes(file.type)
                        ) {
                          toast.error("Upload a PNG, JPEG or PDF file.")
                          return
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error("Documents must be 5 MB or smaller.")
                          return
                        }
                        upload.mutate(
                          { code: doc.code, file },
                          {
                            onSuccess: () =>
                              toast.success(`${doc.name} uploaded.`),
                          }
                        )
                      }}
                    />
                  </label>
                ))
              )}
              {loan.documents.some((doc) => doc.status === "Uploaded") ? (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Uploaded — remove to replace at the desk if needed:
                  </p>
                  <ul className="space-y-1">
                    {loan.documents
                      .filter((doc) => doc.status === "Uploaded")
                      .map((doc) => (
                        <li
                          key={doc.code}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">
                            {doc.name}{" "}
                            <span className="text-muted-foreground">
                              · {formatDateTime(doc.uploadedAt)}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Remove ${doc.name}`}
                            disabled={removeDoc.isPending}
                            onClick={() => removeDoc.mutate(doc.code)}
                          >
                            <Trash2Icon
                              aria-hidden
                              className="size-3 text-muted-foreground"
                            />
                          </Button>
                        </li>
                      ))}
                  </ul>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm font-medium">Deviations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {currentDeviations.length === 0 ? (
                <p className="text-sm text-muted-foreground">None recorded.</p>
              ) : (
                <ul className="divide-y divide-border border border-border">
                  {currentDeviations.map((deviation, index) => {
                    const entry = (catalog.data?.items ?? []).find(
                      (candidate) => candidate.code === deviation.code
                    )
                    return (
                      <li
                        key={`${deviation.code}-${index}`}
                        className="flex items-start gap-2 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">
                            <span className="font-mono text-xs text-muted-foreground">
                              {deviation.code}
                            </span>{" "}
                            {entry?.reasonText ?? deviation.code}
                          </span>
                          <span className="mt-0.5 block text-xs whitespace-pre-wrap text-muted-foreground">
                            {deviation.justification}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove deviation ${entry?.reasonText ?? deviation.code}`}
                          onClick={() =>
                            setDeviations(
                              currentDeviations.filter(
                                (_, removeIndex) => removeIndex !== index
                              )
                            )
                          }
                        >
                          <Trash2Icon
                            aria-hidden
                            className="size-3.5 text-muted-foreground"
                          />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="space-y-2">
                <NativeSelect
                  className="w-full"
                  value={pendingCode}
                  aria-label="Deviation reason"
                  onChange={(event) => setPendingCode(event.target.value)}
                >
                  <NativeSelectOption value="">Add a deviation…</NativeSelectOption>
                  {(catalog.data?.items ?? []).map((entry) => (
                    <NativeSelectOption key={entry.code} value={entry.code}>
                      {entry.code} — {entry.reasonText}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Textarea
                  value={pendingJustification}
                  onChange={(event) =>
                    setPendingJustification(event.target.value)
                  }
                  placeholder="Justification (min 10 characters)"
                  rows={2}
                  aria-label="Deviation justification"
                />
                {deviationError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {deviationError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addDeviation}
                >
                  <PlusIcon aria-hidden className="size-3.5" />
                  Add deviation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm font-medium">Resubmit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="resolutionNotes">
                  What did you correct?{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </Label>
                <Textarea
                  id="resolutionNotes"
                  rows={4}
                  placeholder="Point-by-point against the reviewer's feedback (min 10 characters)"
                  {...form.register("resolutionNotes")}
                  aria-invalid={Boolean(form.formState.errors.resolutionNotes)}
                />
                {form.formState.errors.resolutionNotes ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.resolutionNotes.message}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Resubmitting sends the application back to{" "}
                <span className="font-medium text-foreground">
                  {openRequests[0]?.fromStatus === "ForRecommendation"
                    ? "Recommendation"
                    : "Credit checking"}
                </span>
                . The full decision history is preserved and travels with it.
              </p>
              <Button
                type="submit"
                size="sm"
                className="w-full gap-1.5"
                disabled={revise.isPending}
              >
                <SendIcon aria-hidden className="size-3.5" />
                {revise.isPending ? "Resubmitting…" : "Resubmit application"}
              </Button>
            </CardContent>
          </Card>

          {pastRequests.length > 0 ? (
            <SectionCard title="Earlier returns (resolved)">
              <ul className="space-y-2 text-xs">
                {pastRequests.map((request) => (
                  <li
                    key={request.id}
                    className="border-l-2 border-border pl-2"
                  >
                    <span className="font-medium">
                      {request.requestedByName} ({request.requestedByRole})
                    </span>{" "}
                    · {formatDateTime(request.requestedAt)} · resolved{" "}
                    {request.resolvedAt
                      ? formatDateTime(request.resolvedAt)
                      : "—"}
                    <p className="mt-0.5 text-muted-foreground">
                      {request.overallComments}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard title="Decision history">
            <HistoryTimeline history={loan.history} />
          </SectionCard>
        </div>
      </form>
    </div>
  )
}

export default LoanRevisePage
