import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useFieldArray } from "react-hook-form"
import { AlertTriangleIcon, PlusIcon, Trash2Icon } from "lucide-react"

import type { DeviationCatalogEntry } from "@/features/loans/api/cis.api"
import {
  computeDisposableIncome,
  computeLoanTotals,
} from "@/features/loans/model/loan-computations"
import type { LoanCreateFormValues } from "@/features/loans/schemas/loan-create.schema"
import type { ProductRule } from "@/features/loans/schemas/loan-create.schema"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

interface LoansStepProps {
  form: UseFormReturn<LoanCreateFormValues>
  products: ProductRule[]
  catalog: DeviationCatalogEntry[]
  netTakeHomePay: number | null
  totalMonthlyObligations: number
}

/**
 * Step 2 — loan applications. The encoder can attach several applications to
 * one client bundle (grouped review behavior, spec §7). Computations are live
 * feedback only; the backend recomputes and stays authoritative.
 */
export function LoansStep({
  form,
  products,
  catalog,
  netTakeHomePay,
  totalMonthlyObligations,
}: LoansStepProps) {
  const lines = useFieldArray({ control: form.control, name: "loans" })
  const [editing, setEditing] = useState<number | null>(
    lines.fields.length === 0 ? null : 0
  )
  const watched = form.watch("loans") ?? []

  function addLine() {
    lines.append({
      productCode: "",
      purpose: "",
      proposedAmount: NaN,
      termDays: NaN,
      annualRatePercent: NaN,
      deviations: [],
    })
    setEditing(lines.fields.length)
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {lines.fields.length > 0 ? (
          <Card>
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm font-medium">
                Applications in this group ({lines.fields.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {lines.fields.map((field, index) => {
                  const line = watched[index]
                  const product = products.find(
                    (candidate) => candidate.code === line?.productCode
                  )
                  return (
                    <li key={field.id}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5",
                          editing === index && "bg-muted/60"
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setEditing(index)}
                          aria-label={`Edit application ${index + 1}${product ? `, ${product.code}` : ""}`}
                          aria-expanded={editing === index}
                        >
                          <span className="block truncate text-sm font-medium">
                            {product
                              ? `${product.code} — ${product.description}`
                              : "New application (not completed)"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {line?.purpose || "No purpose yet"}
                            {Number.isFinite(line?.proposedAmount)
                              ? ` · ${formatCurrency(line.proposedAmount)}`
                              : ""}
                            {Number.isFinite(line?.termDays)
                              ? ` · ${line.termDays} days`
                              : ""}
                            {line?.deviations?.length
                              ? ` · ${line.deviations.length} deviation(s)`
                              : ""}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove application ${index + 1}`}
                          onClick={() => {
                            lines.remove(index)
                            setEditing(null)
                          }}
                        >
                          <Trash2Icon
                            aria-hidden
                            className="size-3.5 text-muted-foreground"
                          />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {editing != null && lines.fields[editing] ? (
          <LineEditor
            form={form}
            index={editing}
            products={products}
            catalog={catalog}
            netTakeHomePay={netTakeHomePay}
            totalMonthlyObligations={totalMonthlyObligations}
          />
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm font-medium">
                No applications in this group yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Add the first loan application for this client. Several
                applications submitted together are reviewed as one bundle at
                the desk.
              </p>
            </CardContent>
          </Card>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={addLine}
        >
          <PlusIcon aria-hidden className="size-3.5" />
          {lines.fields.length === 0
            ? "Add application"
            : "Add another application"}
        </Button>

        {form.formState.errors.loans &&
        !Array.isArray(form.formState.errors.loans) ? (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.loans.message}
          </p>
        ) : null}
      </div>

      {editing != null && lines.fields[editing] ? (
        <ComputationPanel
          form={form}
          index={editing}
          products={products}
          netTakeHomePay={netTakeHomePay}
          totalMonthlyObligations={totalMonthlyObligations}
        />
      ) : (
        <aside className="hidden xl:block" aria-hidden />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- line editor
function LineEditor({
  form,
  index,
  products,
  catalog,
  netTakeHomePay,
  totalMonthlyObligations,
}: LoansStepProps & { index: number }) {
  const deviations = useFieldArray({
    control: form.control,
    name: `loans.${index}.deviations`,
  })
  const [pendingCode, setPendingCode] = useState("")
  const [pendingJustification, setPendingJustification] = useState("")
  const [deviationError, setDeviationError] = useState<string | null>(null)

  const productCode = form.watch(`loans.${index}.productCode`)
  const product = products.find((candidate) => candidate.code === productCode)
  const errorAt = (field: string) => {
    const errors = form.formState.errors.loans
    if (!Array.isArray(errors)) return undefined
    const lineErrors = errors[index] as
      Record<string, { message?: string }> | undefined
    return lineErrors?.[field]?.message
  }

  function addDeviation() {
    setDeviationError(null)
    if (!pendingCode) {
      setDeviationError("Select the deviation reason.")
      return
    }
    if (pendingJustification.trim().length < 10) {
      setDeviationError(
        "Justify the deviation for the reviewer (min 10 characters)."
      )
      return
    }
    deviations.append({
      code: pendingCode,
      justification: pendingJustification.trim(),
    })
    setPendingCode("")
    setPendingJustification("")
  }

  return (
    <Card aria-label={`Application ${index + 1} details`}>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-medium">
          Application details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`loans.${index}.productCode`}>
              Loan product{" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
            </Label>
            <NativeSelect
              id={`loans.${index}.productCode`}
              className="w-full"
              value={productCode}
              aria-invalid={Boolean(errorAt("productCode"))}
              onChange={(event) => {
                const value = event.target.value
                form.setValue(`loans.${index}.productCode`, value, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
                const next = products.find((candidate) => candidate.code === value)
                if (next && !Number.isFinite(form.getValues(`loans.${index}.annualRatePercent`))) {
                  form.setValue(`loans.${index}.annualRatePercent`, next.defaultAnnualRatePercent, {
                    shouldDirty: true,
                  })
                }
              }}
            >
              <NativeSelectOption value="">Select product…</NativeSelectOption>
              {products.map((option) => (
                <NativeSelectOption key={option.code} value={option.code}>
                  {option.code} — {option.description}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {product ? (
              <p className="text-xs text-muted-foreground">
                ₱{product.minAmount.toLocaleString()}–₱
                {product.maxAmount.toLocaleString()} · {product.minTermDays}–
                {product.maxTermDays} days · default{" "}
                {product.defaultAnnualRatePercent}%/yr
              </p>
            ) : null}
            {errorAt("productCode") ? (
              <p role="alert" className="text-xs text-destructive">
                {errorAt("productCode")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`loans.${index}.purpose`}>
              Purpose{" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id={`loans.${index}.purpose`}
              placeholder="e.g. Home renovation"
              {...form.register(`loans.${index}.purpose`)}
              aria-invalid={Boolean(errorAt("purpose"))}
            />
            {errorAt("purpose") ? (
              <p role="alert" className="text-xs text-destructive">
                {errorAt("purpose")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`loans.${index}.proposedAmount`}>
              Loan amount (₱){" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id={`loans.${index}.proposedAmount`}
              type="number"
              inputMode="numeric"
              min={product?.minAmount}
              max={product?.maxAmount}
              step={100}
              placeholder={product ? `${product.minAmount}` : "0"}
              {...form.register(`loans.${index}.proposedAmount`, {
                valueAsNumber: true,
              })}
              aria-invalid={Boolean(errorAt("proposedAmount"))}
              className="tabular-nums"
            />
            {errorAt("proposedAmount") ? (
              <p role="alert" className="text-xs text-destructive">
                {errorAt("proposedAmount")}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`loans.${index}.termDays`}>
                Term (days){" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id={`loans.${index}.termDays`}
                type="number"
                inputMode="numeric"
                step={30}
                min={product?.minTermDays}
                max={product?.maxTermDays}
                {...form.register(`loans.${index}.termDays`, {
                  valueAsNumber: true,
                })}
                aria-invalid={Boolean(errorAt("termDays"))}
                className="tabular-nums"
              />
              {errorAt("termDays") ? (
                <p role="alert" className="text-xs text-destructive">
                  {errorAt("termDays")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`loans.${index}.annualRatePercent`}>
                Rate (%/yr){" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id={`loans.${index}.annualRatePercent`}
                type="number"
                inputMode="decimal"
                step={0.5}
                min={0}
                {...form.register(`loans.${index}.annualRatePercent`, {
                  valueAsNumber: true,
                })}
                aria-invalid={Boolean(errorAt("annualRatePercent"))}
                className="tabular-nums"
              />
              {errorAt("annualRatePercent") ? (
                <p role="alert" className="text-xs text-destructive">
                  {errorAt("annualRatePercent")}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <Separator />

        <fieldset>
          <legend className="text-sm font-medium">
            Deviations & exceptions
          </legend>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Record every departure from standard policy (fee discounts, rate
            reductions, missing requirements). Each needs a justification the
            reviewer can assess. The backend catalog is the source of valid
            reasons.
          </p>

          {deviations.fields.length > 0 ? (
            <ul className="mt-2 divide-y divide-border border border-border">
              {deviations.fields.map((field, deviationIndex) => {
                const entry = catalog.find(
                  (candidate) => candidate.code === field.code
                )
                return (
                  <li
                    key={field.id}
                    className="flex items-start gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        <span className="font-mono text-xs text-muted-foreground">
                          {field.code}
                        </span>{" "}
                        {entry?.reasonText ?? field.code}
                      </span>
                      <span className="mt-0.5 block text-xs whitespace-pre-wrap text-muted-foreground">
                        {form.watch(
                          `loans.${index}.deviations.${deviationIndex}.justification`
                        )}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove deviation ${entry?.reasonText ?? field.code}`}
                      onClick={() => deviations.remove(deviationIndex)}
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
          ) : null}

          <div className="mt-2 space-y-2">
            <NativeSelect
              className="w-full"
              value={pendingCode}
              aria-label="Deviation reason"
              onChange={(event) => setPendingCode(event.target.value)}
            >
              <NativeSelectOption value="">Select deviation reason…</NativeSelectOption>
              {catalog.map((entry) => (
                <NativeSelectOption key={entry.code} value={entry.code}>
                  {entry.code} — {entry.reasonText}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Textarea
              value={pendingJustification}
              onChange={(event) => setPendingJustification(event.target.value)}
              placeholder="Justification visible to the Recommender, Evaluator and Approver (min 10 characters)"
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
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            Net take-home pay on file:{" "}
            {netTakeHomePay != null ? formatCurrency(netTakeHomePay) : "—"} ·
            existing monthly obligations:{" "}
            {formatCurrency(totalMonthlyObligations)}
          </p>
        </fieldset>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------ computation ---
export function ComputationPanel({
  form,
  index,
  products,
  netTakeHomePay,
  totalMonthlyObligations,
}: {
  form: UseFormReturn<LoanCreateFormValues>
  index: number
  products: ProductRule[]
  netTakeHomePay: number | null
  totalMonthlyObligations: number
}) {
  const line = form.watch(`loans.${index}`)
  const product = products.find(
    (candidate) => candidate.code === line?.productCode
  )

  const amount = Number(line?.proposedAmount)
  const termDays = Number(line?.termDays)
  const rate = Number(line?.annualRatePercent)
  const ready =
    product &&
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isFinite(termDays) &&
    termDays > 0

  const totals = ready
    ? computeLoanTotals({
        principal: amount,
        annualRatePercent: Number.isFinite(rate)
          ? rate
          : product.defaultAnnualRatePercent,
        termDays,
        notarialFee: product.notarialFee ?? 0,
        docStampFee: product.docStampFee ?? 0,
        insuranceFee: product.insuranceFee ?? 0,
        applicationChargeRate: product.applicationChargeRate ?? 0,
      })
    : null

  const capacity =
    totals && netTakeHomePay != null
      ? computeDisposableIncome(
          { netTakeHomePay, otherMonthlyObligations: totalMonthlyObligations },
          totals.monthlyAmortization
        )
      : null

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-medium">
          Computation preview
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {!totals ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            Select a product and enter a valid amount and term to see the
            computation.
          </p>
        ) : (
          <div className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <Row
                label={`Term (${totals.termMonths} months)`}
                value={`${termDays} days`}
              />
              <Row
                label="Monthly amortization"
                value={formatCurrency(totals.monthlyAmortization)}
                strong
              />
              <Separator />
              <Row
                label="Application charge"
                value={formatCurrency(totals.applicationCharge)}
              />
              <Row
                label="Notarial fee"
                value={formatCurrency(product?.notarialFee ?? 0)}
              />
              <Row
                label="Documentary stamp"
                value={formatCurrency(product?.docStampFee ?? 0)}
              />
              <Row
                label="Insurance"
                value={formatCurrency(product?.insuranceFee ?? 0)}
              />
              <Row
                label="Total deductions"
                value={formatCurrency(totals.totalUpfrontDeductions)}
              />
              <Separator />
              <Row
                label="Net proceeds"
                value={formatCurrency(totals.netProceeds)}
                strong
              />
            </dl>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Indicative figures using the legacy amortization rule (ceil of
              annuity PMT, months = days ÷ 30). The backend recomputes on
              submission and its values are authoritative.
            </p>

            {capacity ? (
              <div>
                <Separator className="mb-2" />
                <dl className="space-y-1.5 text-sm">
                  <Row
                    label="Net take-home pay"
                    value={formatCurrency(netTakeHomePay)}
                  />
                  <Row
                    label="Existing obligations"
                    value={formatCurrency(totalMonthlyObligations)}
                  />
                  <Row
                    label="This amortization"
                    value={formatCurrency(capacity.monthlyAmortization)}
                  />
                  <Row
                    label="Remaining disposable"
                    value={formatCurrency(capacity.remainingDisposable)}
                    strong
                    tone={
                      capacity.remainingDisposable < 0 ? "negative" : undefined
                    }
                  />
                </dl>
                {capacity.isAmortizationExceedingIncome ? (
                  <Alert className="mt-2 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangleIcon aria-hidden className="size-4" />
                    <AlertDescription className="text-xs">
                      Amortization exceeds the net take-home pay on file. You
                      can still submit — the Evaluator will assess capacity —
                      but record a deviation if a policy exception applies.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: "negative"
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right tabular-nums",
          strong && "font-semibold",
          tone === "negative" && "text-red-700 dark:text-red-400"
        )}
      >
        {value}
      </dd>
    </div>
  )
}
