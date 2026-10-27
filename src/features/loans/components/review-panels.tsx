import {
  CheckCircle2Icon,
  FileWarningIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react"

import type { LoanDetail } from "@/features/loans/types/loan-contracts"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
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
import { StatusBadge, ToneBadge } from "@/components/shared/status-badge"

/**
 * Read-only review panels shared by the application detail, evaluation and
 * approval screens. One visual language, one place to change.
 */

export function SectionCard({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
          {title}
          {aside}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  )
}

export function KeyValueGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode; mono?: boolean }[]
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm md:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn("truncate", item.mono && "font-mono text-xs")}
            title={typeof item.value === "string" ? item.value : undefined}
          >
            {item.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ClientPanel({ loan }: { loan: LoanDetail }) {
  return (
    <SectionCard title="Client (from CIS — read-only)">
      <KeyValueGrid
        items={[
          {
            label: "Name",
            value: `${loan.client.firstName}${loan.client.middleName ? ` ${loan.client.middleName[0]}.` : ""} ${loan.client.lastName}${loan.client.suffix ? ` ${loan.client.suffix}` : ""}`,
          },
          { label: "CIS number", value: loan.client.cisNo, mono: true },
          { label: "Account", value: loan.client.accountNo, mono: true },
          { label: "Birth date", value: formatDate(loan.client.birthDate) },
          { label: "Agency", value: loan.client.agency },
          { label: "Position", value: loan.client.positionTitle },
          {
            label: "Employee no.",
            value: loan.client.employeeNumber,
            mono: true,
          },
          { label: "Length of service", value: loan.client.lengthOfService },
          {
            label: "Net take-home pay",
            value:
              loan.client.netTakeHomePay != null
                ? formatCurrency(loan.client.netTakeHomePay)
                : "—",
          },
          { label: "Address", value: loan.client.address },
        ]}
      />
    </SectionCard>
  )
}

export function LoanTermsPanel({ loan }: { loan: LoanDetail }) {
  return (
    <SectionCard
      title="Loan terms & computation"
      aside={
        loan.evaluationVerdict ? (
          <ToneBadge
            tone={
              loan.evaluationVerdict === "Recommended" ? "positive" : "warning"
            }
          >
            Evaluation:{" "}
            {loan.evaluationVerdict === "Recommended"
              ? "recommended"
              : "NOT recommended"}
          </ToneBadge>
        ) : undefined
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <KeyValueGrid
          items={[
            {
              label: "Product",
              value: `${loan.productCode} — ${loan.product}`,
            },
            { label: "Type", value: loan.loanType },
            { label: "Purpose", value: loan.purpose },
            { label: "Amount", value: formatCurrency(loan.proposedAmount) },
            {
              label: "Term",
              value: `${loan.termDays} days (${loan.computed.termMonths} months)`,
            },
            { label: "Annual rate", value: `${loan.annualRatePercent}%` },
          ]}
        />
        <dl className="space-y-1.5 text-sm">
          <ComputedRow
            label="Monthly amortization"
            value={formatCurrency(loan.computed.monthlyAmortization)}
            strong
          />
          <Separator />
          <ComputedRow
            label="Application charge"
            value={formatCurrency(loan.computed.applicationCharge)}
          />
          <ComputedRow
            label="Notarial fee"
            value={formatCurrency(loan.computed.notarialFee)}
          />
          <ComputedRow
            label="Documentary stamp"
            value={formatCurrency(loan.computed.docStampFee)}
          />
          <ComputedRow
            label="Insurance"
            value={formatCurrency(loan.computed.insuranceFee)}
          />
          <ComputedRow
            label="Total deductions"
            value={formatCurrency(loan.computed.totalUpfrontDeductions)}
          />
          <Separator />
          <ComputedRow
            label="Net proceeds"
            value={formatCurrency(loan.computed.netProceeds)}
            strong
          />
        </dl>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Computed by the loan engine; figures above are the backend's
        authoritative values.
      </p>
    </SectionCard>
  )
}

function ComputedRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong && "font-semibold")}>
        {value}
      </dd>
    </div>
  )
}

export function ObligationsPanel({ loan }: { loan: LoanDetail }) {
  const rows = [
    ...loan.obligations.outstandingLoans.map((row) => ({
      ...row,
      kind: "Outstanding",
    })),
    ...loan.obligations.buyOuts.map((row) => ({ ...row, kind: "Buy-out" })),
    ...loan.obligations.ebiReloans.map((row) => ({
      ...row,
      kind: "EBI reloan",
    })),
  ]
  return (
    <SectionCard
      title="Existing obligations"
      aside={
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          monthly {formatCurrency(loan.obligations.totalMonthlyObligations)}
        </span>
      }
    >
      {rows.length === 0 && loan.obligations.incomingLoans.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No existing obligations on file for this client.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-normal">Kind</TableHead>
              <TableHead className="text-xs font-normal">PN</TableHead>
              <TableHead className="text-xs font-normal">Product</TableHead>
              <TableHead className="text-right text-xs font-normal">
                Balance
              </TableHead>
              <TableHead className="text-right text-xs font-normal">
                Amortization
              </TableHead>
              <TableHead className="text-xs font-normal">Maturity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.kind}-${row.id}`}>
                <TableCell className="text-xs">{row.kind}</TableCell>
                <TableCell className="font-mono text-xs">{row.pn}</TableCell>
                <TableCell className="max-w-48 truncate text-xs">
                  {row.productWithDescription ?? "—"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatCurrency(row.outstandingBalance)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatCurrency(row.amortization)}
                </TableCell>
                <TableCell className="text-xs">
                  {formatDate(row.dateMaturity)}
                </TableCell>
              </TableRow>
            ))}
            {loan.obligations.incomingLoans.map((row) => (
              <TableRow key={`incoming-${row.id}`}>
                <TableCell className="text-xs">Incoming</TableCell>
                <TableCell className="font-mono text-xs">—</TableCell>
                <TableCell className="max-w-48 truncate text-xs">
                  {row.name}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatCurrency(row.outstandingBalance)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatCurrency(row.amortization)}
                </TableCell>
                <TableCell className="text-xs">{row.status || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  )
}

export function DeviationsPanel({ loan }: { loan: LoanDetail }) {
  return (
    <SectionCard
      title="Deviations & exceptions"
      aside={
        loan.deviations.length > 0 ? (
          <ToneBadge tone="warning">
            {loan.deviations.length} recorded
          </ToneBadge>
        ) : (
          <ToneBadge tone="neutral">None</ToneBadge>
        )
      }
    >
      {loan.deviations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Standard terms — no deviations recorded.
        </p>
      ) : (
        <ul className="space-y-3">
          {loan.deviations.map((deviation) => (
            <li key={deviation.id} className="border border-border p-3">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {deviation.code}
                </span>
                <span className="font-medium">{deviation.reasonText}</span>
                <ToneBadge
                  tone={deviation.severity >= 2 ? "negative" : "warning"}
                >
                  {deviation.severity === 2
                    ? "Major"
                    : deviation.severity === 1
                      ? "Minor"
                      : "Info"}
                </ToneBadge>
                {deviation.isFeeOverride ? (
                  <ToneBadge tone="neutral">Fee/rate override</ToneBadge>
                ) : null}
              </p>
              <p className="mt-1.5 border-l-2 border-border pl-2 text-xs whitespace-pre-wrap text-muted-foreground">
                {deviation.encoderJustification}
              </p>
              {deviation.remarks.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {deviation.remarks.map((remark) => (
                    <li key={remark.id} className="text-xs">
                      <span className="font-medium">
                        {remark.authorName} ({remark.authorRole})
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatDateTime(remark.createdAt)}
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                        {remark.body}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

export function DocumentsPanel({ loan }: { loan: LoanDetail }) {
  const missing = loan.documents.filter((doc) => doc.status === "Missing")
  return (
    <SectionCard
      title="Document checklist"
      aside={
        loan.documentsComplete ? (
          <ToneBadge tone="positive">
            <CheckCircle2Icon aria-hidden className="size-3" /> Complete
          </ToneBadge>
        ) : (
          <ToneBadge tone="warning">
            <FileWarningIcon aria-hidden className="size-3" /> {missing.length}{" "}
            missing
          </ToneBadge>
        )
      }
    >
      {loan.documentFlag ? (
        <p className="mb-3 border-l-2 border-amber-500 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-200">
          Flagged {formatDateTime(loan.documentFlag.flaggedAt)} by{" "}
          {loan.documentFlag.flaggedByName ?? "reviewer"} —{" "}
          {loan.documentFlag.reason}
        </p>
      ) : null}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {loan.documents.map((doc) => (
          <li
            key={doc.code}
            className={cn(
              "flex items-center gap-2 border px-2.5 py-2 text-sm",
              doc.status === "Missing" ? "border-dashed" : "border-border"
            )}
          >
            {doc.status === "Uploaded" ? (
              <CheckCircle2Icon
                aria-hidden
                className="size-4 flex-none text-emerald-600 dark:text-emerald-400"
              />
            ) : (
              <XCircleIcon
                aria-hidden
                className="size-4 flex-none text-amber-600 dark:text-amber-400"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs">{doc.name}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">
                {doc.code}
                {doc.uploadedAt
                  ? ` · ${formatDate(doc.uploadedAt)} · ${doc.uploadedBy ?? ""}`
                  : ""}
              </span>
            </span>
            <span className="sr-only">
              {doc.status === "Uploaded" ? "uploaded" : "missing"}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

export function RoutingPanel({ loan }: { loan: LoanDetail }) {
  const routing = loan.routing
  return (
    <SectionCard
      title="Approval authority & routing"
      aside={
        <ShieldCheckIcon aria-hidden className="size-4 text-muted-foreground" />
      }
    >
      <KeyValueGrid
        items={[
          {
            label: "Required tier",
            value:
              routing.requiredApprovalTier != null
                ? `Tier ${routing.requiredApprovalTier}`
                : "—",
          },
          { label: "Matched rule", value: routing.matchedRule },
          {
            label: "Deviation severity",
            value:
              routing.deviationSeverity === 2
                ? "Major (2)"
                : routing.deviationSeverity === 1
                  ? "Minor (1)"
                  : "None (0)",
          },
          {
            label: "Total exposure",
            value: formatCurrency(routing.totalExposure),
          },
          { label: "Assigned approver", value: routing.assignedApproverName },
          {
            label: "Documents complete",
            value: routing.documentsComplete
              ? "Yes"
              : `No (${routing.missingDocuments.length} missing)`,
          },
        ]}
      />
      {routing.noAuthorityReason ? (
        <p className="mt-3 border-l-2 border-red-500 bg-red-50 px-2 py-1.5 text-xs text-red-950 dark:bg-red-500/10 dark:text-red-200">
          {routing.noAuthorityReason}
        </p>
      ) : null}
      {routing.missingDocuments.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Missing: {routing.missingDocuments.join("; ")}
        </p>
      ) : null}
    </SectionCard>
  )
}

export function SignaturesPanel({ loan }: { loan: LoanDetail }) {
  return (
    <SectionCard title="Electronic signatures">
      {loan.signatures.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No signatures captured yet. Each consequential decision records the
          officer's signature server-side.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {loan.signatures.map((signature, index) => (
            <li
              key={`${signature.stage}-${index}`}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{signature.stage}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {signature.userName} ({signature.role})
                </span>
              </span>
              <span className="flex-none text-xs text-muted-foreground tabular-nums">
                {formatDateTime(signature.signedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

export function DisbursementPanel({ loan }: { loan: LoanDetail }) {
  const { disbursement } = loan
  if (!disbursement.approvedAt) return null
  return (
    <SectionCard
      title="Disbursement"
      aside={<StatusBadge status={loan.status} />}
    >
      <KeyValueGrid
        items={[
          { label: "Approved", value: formatDateTime(disbursement.approvedAt) },
          {
            label: "30-day deadline",
            value: disbursement.deadlineUtc ? (
              <span
                className={cn(
                  disbursement.isOverdue &&
                    "font-medium text-red-700 dark:text-red-400"
                )}
              >
                {formatDate(disbursement.deadlineUtc)}
                {disbursement.daysRemaining != null
                  ? disbursement.daysRemaining >= 0
                    ? ` (${disbursement.daysRemaining} d left)`
                    : ` (${Math.abs(disbursement.daysRemaining)} d overdue)`
                  : ""}
              </span>
            ) : (
              "—"
            ),
          },
          {
            label: "Released",
            value: disbursement.disbursedAt
              ? formatDateTime(disbursement.disbursedAt)
              : "—",
          },
          {
            label: "Reference",
            value: disbursement.disbursementReference,
            mono: true,
          },
          { label: "Released by", value: disbursement.disbursedBy },
          {
            label: "Voided",
            value: disbursement.voidedAt
              ? formatDateTime(disbursement.voidedAt)
              : "—",
          },
        ]}
      />
      {disbursement.voidReason ? (
        <p className="mt-3 border-l-2 border-red-500 bg-red-50 px-2 py-1.5 text-xs text-red-950 dark:bg-red-500/10 dark:text-red-200">
          {disbursement.voidReason}
        </p>
      ) : null}
      {disbursement.isOverdue ? (
        <p className="mt-3 border-l-2 border-red-500 bg-red-50 px-2 py-1.5 text-xs text-red-950 dark:bg-red-500/10 dark:text-red-200">
          Past the 30-day disbursement window. The prescribed process is voiding
          — disbursement is blocked by the backend until the application is
          voided.
        </p>
      ) : null}
    </SectionCard>
  )
}
