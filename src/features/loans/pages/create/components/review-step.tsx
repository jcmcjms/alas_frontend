import type { UseFormReturn } from "react-hook-form"
import { FileWarningIcon } from "lucide-react"

import type {
  DeviationCatalogEntry,
  DocumentTemplateItem,
} from "@/features/loans/api/cis.api"
import {
  computeDisposableIncome,
  computeLoanTotals,
} from "@/features/loans/model/loan-computations"
import type {
  LoanCreateFormValues,
  ProductRule,
} from "@/features/loans/schemas/loan-create.schema"
import { formatCurrency } from "@/lib/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Step 4 — review. A complete summary of what will be submitted, with the
 * computed consequences, so nothing is confirmed unseen.
 */
export function ReviewStep({
  form,
  products,
  catalog,
  template,
  clientName,
  netTakeHomePay,
  totalMonthlyObligations,
}: {
  form: UseFormReturn<LoanCreateFormValues>
  products: ProductRule[]
  catalog: DeviationCatalogEntry[]
  template: DocumentTemplateItem[]
  clientName: string
  netTakeHomePay: number | null
  totalMonthlyObligations: number
}) {
  const values = form.getValues()
  const lines = values.loans ?? []
  const missingDocs = template.filter(
    (doc) => !(values.documentsHeld ?? []).includes(doc.code)
  )

  const computedLines = lines.map((line) => {
    const product = products.find(
      (candidate) => candidate.code === line.productCode
    )
    const totals = product
      ? computeLoanTotals({
          principal: line.proposedAmount,
          annualRatePercent: line.annualRatePercent,
          termDays: line.termDays,
          notarialFee: product.notarialFee,
          docStampFee: product.docStampFee,
          insuranceFee: product.insuranceFee,
          applicationChargeRate: product.applicationChargeRate,
        })
      : null
    return { line, product, totals }
  })

  const totalPrincipal = computedLines.reduce(
    (sum, entry) => sum + (entry.totals ? entry.line.proposedAmount : 0),
    0
  )
  const totalAmortization = computedLines.reduce(
    (sum, entry) => sum + (entry.totals?.monthlyAmortization ?? 0),
    0
  )
  const capacity =
    netTakeHomePay != null
      ? computeDisposableIncome(
          { netTakeHomePay, otherMonthlyObligations: totalMonthlyObligations },
          totalAmortization
        )
      : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">Client</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-1 pt-4 text-sm sm:grid-cols-3">
          <SummaryField label="Client" value={clientName} />
          <SummaryField label="CIS number" value={values.cisNo} mono />
          <SummaryField label="Account" value={values.accountNo} mono />
          <SummaryField label="Application type" value={values.loanType} />
          <SummaryField
            label="Documents on hand"
            value={`${(values.documentsHeld ?? []).length} of ${template.length}`}
          />
          <SummaryField
            label="Existing monthly obligations"
            value={formatCurrency(totalMonthlyObligations)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">
            Applications ({lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-normal">Product</TableHead>
                <TableHead className="text-xs font-normal">Purpose</TableHead>
                <TableHead className="text-right text-xs font-normal">
                  Amount
                </TableHead>
                <TableHead className="text-right text-xs font-normal">
                  Term
                </TableHead>
                <TableHead className="text-right text-xs font-normal">
                  Rate
                </TableHead>
                <TableHead className="text-right text-xs font-normal">
                  Amortization
                </TableHead>
                <TableHead className="text-right text-xs font-normal">
                  Net proceeds
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computedLines.map(({ line, product, totals }, index) => (
                <TableRow key={index}>
                  <TableCell className="text-sm">
                    {product ? `${product.code}` : "?"}
                    <span className="block text-xs text-muted-foreground">
                      {product?.description}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-40 text-sm">
                    <span className="block truncate" title={line.purpose}>
                      {line.purpose}
                    </span>
                    {line.deviations.length > 0 ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {line.deviations.length} deviation
                        {line.deviations.length === 1 ? "" : "s"}:{" "}
                        {line.deviations
                          .map((deviation) => deviation.code)
                          .join(", ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatCurrency(line.proposedAmount)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {line.termDays} d
                    {totals ? (
                      <span className="text-muted-nowrap block text-xs text-muted-foreground">
                        {totals.termMonths} mo
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {line.annualRatePercent}%
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {totals ? formatCurrency(totals.monthlyAmortization) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {totals ? formatCurrency(totals.netProceeds) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-border font-semibold">
                <TableCell colSpan={2} className="text-sm">
                  Group total
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(totalPrincipal)}
                </TableCell>
                <TableCell
                  colSpan={2}
                  className="text-right text-xs font-normal text-muted-foreground"
                >
                  Combined amortization {formatCurrency(totalAmortization)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {capacity && capacity.isAmortizationExceedingIncome ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <FileWarningIcon aria-hidden className="size-4" />
          <AlertDescription className="text-xs">
            Combined amortization {formatCurrency(totalAmortization)} exceeds
            net take-home pay {formatCurrency(netTakeHomePay)}. The Evaluator
            will scrutinize capacity — make sure the relevant deviations are
            recorded.
          </AlertDescription>
        </Alert>
      ) : null}

      {missingDocs.length > 0 ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <FileWarningIcon aria-hidden className="size-4" />
          <AlertDescription className="text-xs">
            Submitting with {missingDocs.length} missing document
            {missingDocs.length === 1 ? "" : "s"}:{" "}
            {missingDocs.map((doc) => doc.name).join("; ")}. The application
            will be flagged as documents-incomplete.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">
            Deviations recorded
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {lines.every((line) => line.deviations.length === 0) ? (
            <p className="text-sm text-muted-foreground">
              None — standard terms and complete requirements across the group.
            </p>
          ) : (
            <ul className="space-y-2">
              {lines.flatMap((line, lineIndex) =>
                line.deviations.map((deviation, deviationIndex) => {
                  const entry = catalog.find(
                    (candidate) => candidate.code === deviation.code
                  )
                  return (
                    <li
                      key={`${lineIndex}-${deviationIndex}`}
                      className="text-sm"
                    >
                      <p>
                        <span className="font-mono text-xs text-muted-foreground">
                          {deviation.code}
                        </span>{" "}
                        <span className="font-medium">
                          {entry?.reasonText ?? deviation.code}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · application {lineIndex + 1} ({line.productCode})
                        </span>
                      </p>
                      <p className="mt-0.5 border-l-2 border-border pl-2 text-xs whitespace-pre-wrap text-muted-foreground">
                        {deviation.justification}
                      </p>
                    </li>
                  )
                })
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        On submission the backend assigns the first review stage from the
        current workflow configuration and records your electronic identity on
        the application.
      </p>
      <Separator />
    </div>
  )
}

function SummaryField({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={mono ? "truncate font-mono text-xs" : "truncate"}
        title={value}
      >
        {value || "—"}
      </p>
    </div>
  )
}
