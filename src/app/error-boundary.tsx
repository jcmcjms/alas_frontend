import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

interface Props {
  featureName: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Route-level error boundary: keeps failures inside the feature area. */
export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Never log sensitive payloads — message and component stack only.
    console.error(
      `[${this.props.featureName}] Unhandled UI error: ${error.message}`
    )
    if (import.meta.env.DEV) {
      console.error(info.componentStack)
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 border border-dashed p-8"
        >
          <div>
            <h2 className="text-base font-semibold">
              {this.props.featureName} hit an unexpected error
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              The rest of the application still works. Reloading this screen
              usually resolves the problem; if it persists, note the time and
              contact support.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
