import { Link, useParams } from "react-router-dom"
import { ArrowLeftIcon, PrinterIcon } from "lucide-react"

import { useLoanDetail } from "@/features/loans/api/loans.queries"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { DetailSkeleton, ErrorState } from "@/components/shared/state-views"
import { statusLabel } from "@/features/loans/types/loan-status"

/**
 * Print view of the loan approval form (spec §8: "print supported approval
 * forms"). Clean paper layout; the app chrome is hidden by print CSS. The
 * signature blocks mirror the server-captured electronic signatures.
 */
export function PrintApprovalFormPage() {
  const { loanId = "" } = useParams()
  const detail = useLoanDetail(loanId)
  const loan = detail.data

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

  const signaturesByStage = (stage: string) =>
    loan.signatures.find((signature) => signature.stage === stage)

  return (
    <div className="p-6 print:p-0">
      <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-4">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link to={`/loans/${loan.id}`}>
              <ArrowLeftIcon aria-hidden className="size-3.5" />
              Back to application
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
            <PrinterIcon aria-hidden className="size-3.5" />
            Print approval form
          </Button>
        </div>

        <header className="space-y-1 border-b border-border pb-3">
          <h1 className="text-lg font-semibold tracking-tight">
            Loan Application Approval Form
          </h1>
          <p className="text-xs text-muted-foreground">
            ALAS v3 · {loan.lamId} · Group {loan.applicationGroupNo} · Status:{" "}
            {statusLabel(loan.status)} · Printed{" "}
            {formatDateTime(new Date().toISOString())}
          </p>
        </header>

        <PrintSection title="1. Borrower">
          <PrintGrid
            rows={[
              [
                "Name",
                `${loan.client.firstName}${loan.client.middleName ? ` ${loan.client.middleName[0]}.` : ""} ${loan.client.lastName}${loan.client.suffix ? ` ${loan.client.suffix}` : ""}`,
              ],
              ["CIS number", loan.client.cisNo],
              ["Birth date", formatDate(loan.client.birthDate)],
              ["Agency / employer", loan.client.agency ?? "—"],
              ["Position", loan.client.positionTitle ?? "—"],
              ["Employee no.", loan.client.employeeNumber ?? "—"],
              ["Length of service", loan.client.lengthOfService ?? "—"],
              ["Net take-home pay", formatCurrency(loan.client.netTakeHomePay)],
              ["Address", loan.client.address ?? "—"],
              ["Deposit account", loan.client.accountNo ?? "—"],
            ]}
          />
        </PrintSection>

        <PrintSection title="2. Loan applied for">
          <PrintGrid
            rows={[
              ["Product", `${loan.productCode} — ${loan.product}`],
              ["Type", loan.loanType],
              ["Purpose", loan.purpose ?? "—"],
              ["Amount applied", formatCurrency(loan.proposedAmount)],
              [
                "Term",
                `${loan.termDays} days (${loan.computed.termMonths} months)`,
              ],
              ["Annual interest rate", `${loan.annualRatePercent}%`],
              [
                "Monthly amortization",
                formatCurrency(loan.computed.monthlyAmortization),
              ],
              [
                "Application charge",
                formatCurrency(loan.computed.applicationCharge),
              ],
              [
                "Notarial / doc stamp / insurance",
                `${formatCurrency(loan.computed.notarialFee)} / ${formatCurrency(loan.computed.docStampFee)} / ${formatCurrency(loan.computed.insuranceFee)}`,
              ],
              ["Net proceeds", formatCurrency(loan.computed.netProceeds)],
            ]}
          />
        </PrintSection>

        <PrintSection title="3. Existing obligations">
          {loan.obligations.outstandingLoans.length === 0 ? (
            <p className="text-xs text-muted-foreground">None on record.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-normal">PN</th>
                  <th className="py-1 font-normal">Product</th>
                  <th className="py-1 text-right font-normal">Balance</th>
                  <th className="py-1 text-right font-normal">Amortization</th>
                </tr>
              </thead>
              <tbody>
                {loan.obligations.outstandingLoans.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-1">{row.pn}</td>
                    <td className="py-1">
                      {row.productWithDescription ?? "—"}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCurrency(row.outstandingBalance)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCurrency(row.amortization)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border font-medium">
                  <td colSpan={3} className="py-1 text-right">
                    Total monthly obligations
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCurrency(loan.obligations.totalMonthlyObligations)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </PrintSection>

        <PrintSection title="4. Deviations & exceptions">
          {loan.deviations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              None — standard terms.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {loan.deviations.map((deviation) => (
                <li key={deviation.id}>
                  <p className="font-medium">
                    {deviation.code} · {deviation.reasonText} (severity{" "}
                    {deviation.severity})
                  </p>
                  <p className="text-muted-foreground">
                    {deviation.encoderJustification}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </PrintSection>

        <PrintSection title="5. Routing & authority">
          <PrintGrid
            rows={[
              [
                "Required approval tier",
                loan.routing.requiredApprovalTier != null
                  ? `Tier ${loan.routing.requiredApprovalTier}`
                  : "—",
              ],
              ["Matched authority", loan.routing.matchedRule ?? "—"],
              ["Total exposure", formatCurrency(loan.routing.totalExposure)],
              ["Assigned approver", loan.routing.assignedApproverName ?? "—"],
              [
                "Documents complete",
                loan.routing.documentsComplete
                  ? "Yes"
                  : `No — missing: ${loan.routing.missingDocuments.join("; ")}`,
              ],
            ]}
          />
        </PrintSection>

        <PrintSection title="6. Evaluation & decision record">
          <ul className="space-y-1 text-xs">
            {loan.history
              .filter(
                (entry) => entry.toStatus && entry.fromStatus !== entry.toStatus
              )
              .map((entry) => (
                <li key={entry.id}>
                  <span className="font-medium">{entry.action}</span>:{" "}
                  {entry.fromStatus} → {entry.toStatus} ·{" "}
                  {entry.actionByUserName} ({entry.actionByRole}) ·{" "}
                  {formatDateTime(entry.actionDate)}
                  {entry.comments ? (
                    <span className="block pl-3 text-muted-foreground">
                      “{entry.comments}”
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
          {loan.evaluationVerdict ? (
            <p className="mt-2 text-xs">
              Evaluation verdict:{" "}
              <span className="font-medium">{loan.evaluationVerdict}</span>
            </p>
          ) : null}
        </PrintSection>

        <PrintSection title="7. Signatures">
          <div className="grid grid-cols-3 gap-6 pt-2">
            {(["Recommendation", "Evaluation", "Approval"] as const).map(
              (stage) => {
                const signature = signaturesByStage(stage)
                return (
                  <div key={stage} className="text-xs">
                    <div className="flex h-14 items-end border-b border-foreground/60 pb-1">
                      {signature ? (
                        <span className="italic">{signature.userName}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-medium">{stage}</p>
                    <p className="text-muted-foreground">
                      {signature
                        ? `${signature.role} · ${formatDate(signature.signedAt)}`
                        : "Name / role / date"}
                    </p>
                  </div>
                )
              }
            )}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Electronic signatures are captured server-side at each decision.
            This printout is a record copy; the authoritative trail is the
            application history in ALAS.
          </p>
        </PrintSection>
      </div>
    </div>
  )
}

function PrintSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function PrintGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-3 border-b border-border/60 py-0.5"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default PrintApprovalFormPage
