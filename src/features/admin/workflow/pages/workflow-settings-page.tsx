import { useState } from "react"
import { GitBranchIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api/api-error"
import {
  useLoanCountByStatus,
  useUpdateWorkflowConfiguration,
  useWorkflowConfiguration,
} from "@/features/loans/api/loans.queries"
import type { WorkflowConfigurationDto } from "@/features/loans/types/loan-contracts"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/state-views"
import { ToneBadge } from "@/components/shared/status-badge"

const PIPELINE_ROLES = [
  "Encoder",
  "Recommender",
  "Evaluator",
  "Approver",
] as const

function PipelinePreview({
  requireRecommendation,
  diff,
}: {
  requireRecommendation: boolean
  diff?: "added" | "removed"
}) {
  const active = PIPELINE_ROLES.filter(
    (role) => requireRecommendation || role !== "Recommender"
  )
  return (
    <div
      role="img"
      aria-label={`Loan pipeline for new applications: ${active.join(", ")}, then Approved${
        diff === "removed"
          ? ". Recommendation step skipped"
          : diff === "added"
            ? ". Recommendation step added"
            : ""
      }`}
      className="flex flex-wrap items-center gap-1.5"
    >
      {PIPELINE_ROLES.map((role, index) => {
        const isRecommender = role === "Recommender"
        const skipped =
          isRecommender && !requireRecommendation && diff !== "removed"
        if (skipped) return null
        return (
          <span key={role} className="flex items-center gap-1.5">
            {index > 0 &&
            !(
              isRecommender &&
              !requireRecommendation &&
              diff === "removed" &&
              index === 1
            ) ? (
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            ) : null}
            {isRecommender && !requireRecommendation && diff === "removed" ? (
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
            ) : null}
            <span
              className={cn(
                "border px-2 py-0.5 text-xs",
                isRecommender &&
                  diff === "added" &&
                  "border-primary/50 bg-primary/5 font-medium",
                isRecommender &&
                  diff === "removed" &&
                  "text-muted-foreground line-through opacity-60",
                !(isRecommender && diff) &&
                  "border-border bg-muted/40 font-normal"
              )}
            >
              {role}
            </span>
          </span>
        )
      })}
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <span className="border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        Approved
      </span>
    </div>
  )
}

/**
 * Workflow settings (spec §5.2). The switch only controls the INITIAL routing
 * of NEW applications; in-flight applications keep their established route.
 * The saved value shown is always the backend's authoritative configuration —
 * never an optimistic flip — and a stale save surfaces as a 409 with the
 * current server value.
 */
export function WorkflowSettingsPage() {
  const config = useWorkflowConfiguration()
  const update = useUpdateWorkflowConfiguration()
  const [pending, setPending] = useState<boolean | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [conflict, setConflict] = useState<WorkflowConfigurationDto | null>(
    null
  )

  // Backlog warning is only fetched while the "disable" dialog is open.
  const backlog = useLoanCountByStatus(
    "ForRecommendation",
    dialogOpen && pending === false
  )

  if (config.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-56 max-w-2xl" />
      </div>
    )
  }
  if (config.isError || !config.data) {
    return (
      <div className="p-6">
        <ErrorState
          error={config.error}
          onRetry={() => void config.refetch()}
          title="Couldn't load workflow settings"
        />
      </div>
    )
  }

  const current = config.data.requireRecommendation

  function requestChange(next: boolean) {
    setConflict(null)
    setPending(next)
    setDialogOpen(true)
  }

  function save() {
    if (pending == null || !config.data) return
    update.mutate(
      { requireRecommendation: pending, expectedVersion: config.data.version },
      {
        onSuccess: (saved) => {
          setDialogOpen(false)
          setPending(null)
          toast.success(
            saved.requireRecommendation
              ? "Recommendation step enabled for new applications."
              : "Recommendation step disabled for new applications."
          )
        },
        onError: (error) => {
          if (error instanceof ApiError && error.isConflict) {
            // Stale configuration: surface the authoritative current value and
            // force a deliberate re-save instead of silently overwriting.
            const currentConfig = (
              error.problem as
                { current?: WorkflowConfigurationDto } | undefined
            )?.current
            setConflict(currentConfig ?? null)
            setDialogOpen(false)
            setPending(null)
            void config.refetch()
            return
          }
          // Close the dialog so the persistent in-card failure state and the
          // unchanged setting are visible together.
          setDialogOpen(false)
          setPending(null)
          toast.error(getErrorMessage(error))
        },
      }
    )
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Workflow settings"
        description="Controls the initial routing of NEW applications. The backend assigns every application's route at submission; changing this setting never reroutes applications already in progress."
      />

      {conflict ? (
        <Alert
          className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          role="alert"
        >
          <TriangleAlertIcon aria-hidden className="size-4" />
          <AlertTitle className="text-sm">
            Setting changed by another administrator
          </AlertTitle>
          <AlertDescription className="text-xs">
            Your save was rejected because the configuration changed while you
            were editing. Current value:{" "}
            <span className="font-medium">
              {conflict.requireRecommendation
                ? "Recommendation required"
                : "Recommendation skipped"}
            </span>
            {conflict.updatedByName
              ? `, changed by ${conflict.updatedByName}`
              : ""}
            . Review below and save again if you still want to change it.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="max-w-2xl">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranchIcon aria-hidden className="size-4 text-primary" />
            Branch head recommendation
          </CardTitle>
          <CardDescription className="pt-1 text-xs">
            Decides whether the branch head (Recommender) reviews new
            applications before credit evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Require recommendation before evaluation
                <ToneBadge tone={current ? "positive" : "neutral"}>
                  {current ? "On" : "Off"}
                </ToneBadge>
              </p>
              <p className="text-xs text-muted-foreground">
                Changing this only affects new applications. Loans already in
                progress keep their current route.
              </p>
              <p
                className="text-xs text-muted-foreground"
                title={
                  config.data.updatedAt
                    ? formatDateTime(config.data.updatedAt)
                    : undefined
                }
              >
                {config.data.source === "Database" && config.data.updatedByName
                  ? `Changed by ${config.data.updatedByName}${config.data.updatedAt ? ` · ${formatRelative(config.data.updatedAt)}` : ""}`
                  : "Using the built-in default."}
                {config.data.version ? ` · rev ${config.data.version}` : ""}
              </p>
            </div>
            <Switch
              checked={current}
              disabled={update.isPending}
              aria-label="Require recommendation before evaluation"
              onCheckedChange={(value) => requestChange(value)}
            />
          </div>

          <div className="space-y-1.5 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">
              Current pipeline for new applications
            </p>
            <PipelinePreview requireRecommendation={current} />
            <p className="text-xs text-muted-foreground">
              New submissions start at{" "}
              <span className="font-medium text-foreground">
                {config.data.initialStatus === "ForRecommendation"
                  ? "For Recommendation"
                  : "For Checking"}
              </span>{" "}
              (stages: {config.data.stages.join(" → ")}).
            </p>
          </div>

          {update.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle className="text-sm">Save failed</AlertTitle>
              <AlertDescription className="text-xs">
                {getErrorMessage(update.error)} The setting still shows the last
                value the server confirmed.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!update.isPending) {
            setDialogOpen(open)
            if (!open) setPending(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? "Enable" : "Disable"} the recommendation step?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? "New applications will go to the branch head (Recommender) before credit evaluation."
                : "New applications will skip the branch head and go straight to the Evaluator."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <PipelinePreview
              requireRecommendation={pending ?? current}
              diff={pending ? "added" : "removed"}
            />
            {!pending && backlog.isPending ? (
              <p className="text-xs text-muted-foreground" role="status">
                Checking for waiting applications…
              </p>
            ) : null}
            {!pending && (backlog.data?.totalCount ?? 0) > 0 ? (
              <p className="flex items-start gap-1.5 border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <TriangleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 flex-none"
                />
                <span>
                  {backlog.data?.totalCount} application
                  {backlog.data?.totalCount === 1 ? " is" : "s are"} already
                  waiting for recommendation. They keep the Recommender stage —
                  disabling only changes where NEW applications start.
                </span>
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              The change is audited with your name and takes effect for
              submissions after the save.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant={pending ? "default" : "destructive"}
              disabled={update.isPending}
              onClick={save}
            >
              {update.isPending
                ? "Saving…"
                : pending
                  ? "Enable step"
                  : "Disable step"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default WorkflowSettingsPage
