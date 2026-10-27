import { useState } from "react"
import {
  BanIcon,
  BanknoteIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useSession } from "@/features/auth/session-context"
import { PERMISSIONS } from "@/features/auth/types"
import {
  useConfirmDisbursement,
  useExpireLoan,
  usePrepareDisbursement,
  useSyncToOngoing,
} from "@/features/loans/api/loans.queries"
import { formatDate } from "@/lib/format"
import type { LoanDetail } from "@/features/loans/types/loan-contracts"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DecisionDialog } from "@/components/shared/decision-dialog"

type DialogKind = "prepare" | "confirm" | "expire" | null

/**
 * Post-approval processing actions (spec §5.6/§5.7). The 30-day rule lives in
 * the backend: prepare/confirm are rejected once the window lapses, and the
 * void ("expire") endpoint only succeeds for genuinely overdue applications.
 * The UI never simulates these transitions locally.
 */
export function DisbursementActions({ loan }: { loan: LoanDetail }) {
  const { hasPermission } = useSession()
  const prepare = usePrepareDisbursement(loan.id)
  const confirm = useConfirmDisbursement(loan.id)
  const expire = useExpireLoan(loan.id)
  const sync = useSyncToOngoing(loan.id)
  const [dialog, setDialog] = useState<DialogKind>(null)

  if (!hasPermission(PERMISSIONS.loansDisburse)) return null

  const { disbursement } = loan
  const overdue = disbursement.isOverdue

  return (
    <section aria-label="Disbursement processing" className="space-y-2">
      {overdue ? (
        <Alert variant="destructive" role="alert">
          <ShieldAlertIcon aria-hidden className="size-4" />
          <AlertDescription className="text-xs">
            The 30-day disbursement window lapsed on{" "}
            {formatDate(disbursement.deadlineUtc)}. The backend blocks release —
            this application is eligible for voiding.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {loan.status === "Approved" && !overdue ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={prepare.isPending}
            onClick={() => setDialog("prepare")}
          >
            <BanknoteIcon aria-hidden className="size-3.5" />
            {prepare.isPending ? "Preparing…" : "Prepare disbursement"}
          </Button>
        ) : null}

        {(loan.status === "Approved" || loan.status === "ForDisbursement") &&
        !overdue ? (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={confirm.isPending}
            onClick={() => setDialog("confirm")}
          >
            <BanknoteIcon aria-hidden className="size-3.5" />
            {confirm.isPending ? "Releasing…" : "Confirm proceeds released"}
          </Button>
        ) : null}

        {overdue &&
        (loan.status === "Approved" || loan.status === "ForDisbursement") ? (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            disabled={expire.isPending}
            onClick={() => setDialog("expire")}
          >
            <BanIcon aria-hidden className="size-3.5" />
            {expire.isPending ? "Voiding…" : "Void application (timeout)"}
          </Button>
        ) : null}

        {loan.status === "Disbursed" ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCwIcon aria-hidden className="size-3.5" />
            {sync.isPending ? "Syncing…" : "Sync with core (mark On Going)"}
          </Button>
        ) : null}

        {loan.status === "Expired" ? (
          <p className="text-xs text-muted-foreground">
            Voided {formatDate(disbursement.voidedAt)} —{" "}
            {disbursement.voidReason}
          </p>
        ) : null}
        {loan.status === "OnGoing" ? (
          <p className="text-xs text-muted-foreground">
            Active loan — amortizations are posted by the core system.
          </p>
        ) : null}
      </div>

      <DecisionDialog
        open={dialog === "prepare"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Prepare disbursement?"
        subject={`${loan.lamId} · ${formatDate(disbursement.deadlineUtc)} deadline`}
        consequence="Moves the application to For Disbursement so proceeds can be released. The 30-day window keeps running."
        confirmLabel="Prepare disbursement"
        pending={prepare.isPending}
        error={prepare.error}
        onConfirm={() => {
          prepare.mutate(loan.rowVersion, {
            onSuccess: () => {
              setDialog(null)
              toast.success(`${loan.lamId} is now For Disbursement.`)
            },
          })
        }}
      />

      <DecisionDialog
        open={dialog === "confirm"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Confirm proceeds released?"
        subject={`${loan.lamId} · net proceeds on file`}
        consequence="Marks the loan Disbursed and records the release reference. Only confirm after the credit actually posts."
        confirmLabel="Confirm release"
        remarksLabel="Disbursement reference"
        remarksPlaceholder="Core system reference (optional — one is generated when left blank)"
        pending={confirm.isPending}
        error={confirm.error}
        onConfirm={(reference) => {
          confirm.mutate(
            { reference, rowVersion: loan.rowVersion },
            {
              onSuccess: () => {
                setDialog(null)
                toast.success(`${loan.lamId} marked as disbursed.`)
              },
            }
          )
        }}
      />

      <DecisionDialog
        open={dialog === "expire"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Void this application?"
        subject={`${loan.lamId} · window lapsed ${formatDate(disbursement.deadlineUtc)}`}
        consequence="Voids the approval under the 30-day disbursement-timeout policy. This is final — the client must reapply."
        confirmLabel="Void application"
        remarksLabel="Void reason"
        remarksRequired
        remarksMinLength={10}
        remarksPlaceholder="e.g. Client did not claim proceeds within the 30-day window (min 10 characters)"
        destructive
        pending={expire.isPending}
        error={expire.error}
        onConfirm={(reason) => {
          expire.mutate(reason, {
            onSuccess: () => {
              setDialog(null)
              toast.success(`${loan.lamId} voided (disbursement timeout).`)
            },
          })
        }}
      />
    </section>
  )
}
