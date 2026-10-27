import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { ShieldAlertIcon } from "lucide-react"

import { useSession } from "@/features/auth/session-context"
import { FeatureErrorBoundary } from "@/app/error-boundary"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

function FullPagePending() {
  return (
    <div
      className="flex h-svh items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Spinner className="size-6" />
    </div>
  )
}

/** Blocks unauthenticated access; forwards to /login preserving the target. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, sessionExpired } = useSession()
  const location = useLocation()

  if (status === "initializing") return <FullPagePending />
  if (status !== "authenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search, sessionExpired }}
      />
    )
  }
  return <>{children}</>
}

interface RequirePermissionProps {
  permission?: string
  anyOf?: string[]
  featureName: string
  children: ReactNode
}

/**
 * UX-level gating only — the backend independently authorizes every call.
 * Denied users see an in-place explanation, not a blank screen.
 */
export function RequirePermission({
  permission,
  anyOf,
  featureName,
  children,
}: RequirePermissionProps) {
  const { hasPermission, hasAnyPermission } = useSession()

  const allowed = permission
    ? hasPermission(permission)
    : anyOf
      ? hasAnyPermission(anyOf)
      : true

  return (
    <FeatureErrorBoundary featureName={featureName}>
      {allowed ? children : <ForbiddenInline featureName={featureName} />}
    </FeatureErrorBoundary>
  )
}

export function ForbiddenInline({ featureName }: { featureName: string }) {
  return (
    <div className="p-6">
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-3 border border-dashed px-8 py-12 text-center"
      >
        <ShieldAlertIcon aria-hidden className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold">Access denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role doesn't permit access to {featureName}. The backend
            enforces this independently — hidden actions are not merely
            concealed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.history.back()}
        >
          Go back
        </Button>
      </div>
    </div>
  )
}
