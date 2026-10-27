import { Link } from "react-router-dom"
import { ShieldAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ForbiddenPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div
        role="alert"
        className="flex w-full max-w-md flex-col items-center gap-3 border border-border bg-card px-8 py-12 text-center"
      >
        <ShieldAlertIcon aria-hidden className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-base font-semibold">Access denied</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You don't have permission to view this page. If you believe you
            should have access, contact your system administrator — permissions
            are enforced by the server.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Return to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}

export default ForbiddenPage
