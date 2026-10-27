import { useMemo, type ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { createAppQueryClient } from "@/app/query-client"
import { SessionProvider } from "@/features/auth/session-context"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export function AppProviders({ children }: { children: ReactNode }) {
  // One QueryClient for the app lifetime; session changes clear its cache
  // inside SessionProvider rather than recreating the client.
  const queryClient = useMemo(() => createAppQueryClient(), [])

  return (
    <ThemeProvider defaultTheme="light" storageKey="alas-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SessionProvider>{children}</SessionProvider>
        </TooltipProvider>
        <Toaster position="bottom-right" closeButton richColors={false} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
