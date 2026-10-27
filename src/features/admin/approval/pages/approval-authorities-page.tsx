import { useState } from "react"
import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react"

import {
  SCOPE_LABELS,
  SEVERITY_LABELS,
  useApprovalAuthorities,
  useAssignAuthorityUsers,
  useUpdateAuthority,
  type ApprovalAuthority,
} from "@/features/admin/approval/api/approval.api"
import { useUsers } from "@/features/admin/users/api/users.api"
import { formatCurrency } from "@/lib/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState, TableSkeleton } from "@/components/shared/state-views"
import { ToneBadge } from "@/components/shared/status-badge"

/**
 * Approval authorities (spec §5.5): tiers define who may approve what. The
 * routing engine (backend) matches severity + exposure to a tier and assigns
 * the approver; this screen maintains the matrix and assignments.
 */
export function ApprovalAuthoritiesPage() {
  const authorities = useApprovalAuthorities()

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Approval authorities"
        description="Tiers are matched in order: the first tier covering the application's deviation severity and total exposure receives it. Only the assigned approver may approve — enforced by the backend."
      />
      {authorities.isPending ? <TableSkeleton rows={3} /> : null}
      {authorities.isError ? (
        <ErrorState
          error={authorities.error}
          onRetry={() => void authorities.refetch()}
          title="Couldn't load approval authorities"
        />
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {(authorities.data?.items ?? []).map((authority) => (
          <AuthorityCard key={authority.key} authority={authority} />
        ))}
      </div>
    </div>
  )
}

function AuthorityCard({ authority }: { authority: ApprovalAuthority }) {
  const update = useUpdateAuthority(authority.key)
  const assign = useAssignAuthorityUsers(authority.key)
  const approvers = useUsers({
    page: 1,
    pageSize: 50,
    search: "",
    role: "Approver",
  })
  const [exposure, setExposure] = useState(String(authority.maxTotalExposure))
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    authority.assignedUsers.map((user) => user.userId)
  )

  const exposureValid =
    Number(exposure) > 0 && Number.isFinite(Number(exposure))

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <ShieldCheckIcon
              aria-hidden
              className="size-4 text-muted-foreground"
            />
            {authority.displayName}
          </span>
          <ToneBadge tone="neutral">
            {SCOPE_LABELS[authority.scopeType]}
          </ToneBadge>
        </CardTitle>
        <CardDescription className="text-xs">
          Priority {authority.priority} ·{" "}
          {authority.allowNew ? "new loans" : "no new loans"} ·{" "}
          {authority.allowRenewal ? "reloans" : "no reloans"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`exposure-${authority.key}`}>
              Max total exposure (₱)
            </Label>
            <Input
              id={`exposure-${authority.key}`}
              type="number"
              step={50_000}
              className="tabular-nums"
              value={exposure}
              onChange={(event) => setExposure(event.target.value)}
              aria-invalid={!exposureValid}
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              currently {formatCurrency(authority.maxTotalExposure)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`severity-${authority.key}`}>
              Max deviation severity
            </Label>
            <Select
              value={String(authority.maxSeverity)}
              onValueChange={(value) =>
                update.mutate({ maxSeverity: Number(value) as 0 | 1 | 2 })
              }
              disabled={update.isPending}
            >
              <SelectTrigger id={`severity-${authority.key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {([0, 1, 2] as const).map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    {SEVERITY_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={
              !exposureValid ||
              update.isPending ||
              Number(exposure) === authority.maxTotalExposure
            }
            onClick={() =>
              update.mutate({ maxTotalExposure: Number(exposure) })
            }
            className="gap-1.5"
          >
            {update.isPending ? (
              <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" />
            ) : null}
            Save limits
          </Button>
          {update.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {update.error instanceof Error
                ? update.error.message
                : "Save failed"}
            </p>
          ) : null}
        </div>

        <Separator />

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            Assigned approvers
          </legend>
          {approvers.isPending ? (
            <p className="text-xs text-muted-foreground">Loading approvers…</p>
          ) : (
            <ul className="space-y-1.5">
              {(approvers.data?.items ?? []).map((user) => {
                const checked = selectedUsers.includes(user.id)
                return (
                  <li key={user.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`${authority.key}-${user.id}`}
                      checked={checked}
                      disabled={!user.isActive}
                      onCheckedChange={(value) =>
                        setSelectedUsers((current) =>
                          value === true
                            ? [...current, user.id]
                            : current.filter((id) => id !== user.id)
                        )
                      }
                    />
                    <Label
                      htmlFor={`${authority.key}-${user.id}`}
                      className="flex-1 text-sm font-normal"
                    >
                      {user.firstName} {user.lastName}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {user.branchCode}
                        {user.isActive ? "" : " · suspended"}
                      </span>
                    </Label>
                  </li>
                )
              })}
              {(approvers.data?.items ?? []).length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  No users hold the Approver role.
                </li>
              ) : null}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={assign.isPending}
              onClick={() =>
                assign.mutate(selectedUsers, {
                  onError: () =>
                    setSelectedUsers(
                      authority.assignedUsers.map((user) => user.userId)
                    ),
                })
              }
            >
              {assign.isPending ? "Saving…" : "Save assignment"}
            </Button>
            {selectedUsers.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                A tier without approvers cannot receive applications.
              </p>
            ) : null}
          </div>
          {assign.isError ? (
            <Alert variant="destructive" className="mt-2" role="alert">
              <AlertDescription className="text-xs">
                {assign.error instanceof Error
                  ? assign.error.message
                  : "Assignment failed."}
              </AlertDescription>
            </Alert>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  )
}

export default ApprovalAuthoritiesPage
