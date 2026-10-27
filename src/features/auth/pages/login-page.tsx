import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import {
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useSession } from "@/features/auth/session-context"
import { MOCK_MODE_ENABLED } from "@/lib/env"
import { getErrorMessage } from "@/lib/api/api-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
})

type LoginFormValues = z.infer<typeof loginSchema>

const mocksEnabled = MOCK_MODE_ENABLED

const DEMO_ACCOUNTS = [
  { role: "Encoder", username: "encoder" },
  { role: "Recommender", username: "recommender" },
  { role: "Evaluator", username: "evaluator" },
  { role: "Approver", username: "approver" },
  { role: "Admin", username: "admin" },
]

export function LoginPage() {
  const { status, user, login, sessionExpired } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? "/"
  const expired =
    Boolean(
      (location.state as { sessionExpired?: boolean } | null)?.sessionExpired
    ) || sessionExpired

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  })

  if (status === "authenticated" && user) {
    return (
      <Navigate
        to={user.mustChangePassword ? "/change-password" : from}
        replace
      />
    )
  }

  async function onSubmit(values: LoginFormValues) {
    setFormError(null)
    try {
      const session = await login(values.username, values.password)
      navigate(session.mustChangePassword ? "/change-password" : from, {
        replace: true,
      })
    } catch (error) {
      // Input is preserved; only the error banner changes.
      setFormError(getErrorMessage(error))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <div
            className="mx-auto flex size-10 items-center justify-center border border-border bg-card"
            aria-hidden
          >
            <svg viewBox="0 0 16 16" className="size-6">
              <rect
                x="2"
                y="3"
                width="12"
                height="1.6"
                className="fill-foreground"
              />
              <rect
                x="2"
                y="7.2"
                width="8"
                height="1.6"
                className="fill-muted-foreground"
              />
              <rect
                x="2"
                y="11.4"
                width="10"
                height="1.6"
                className="fill-primary"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">ALAS v3</h1>
          <p className="text-sm text-muted-foreground">
            Automated Loan Application System
          </p>
        </div>

        <div className="border border-border bg-card p-6">
          <h2 className="text-sm font-medium">Sign in</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Internal banking system — authorized officers only.
          </p>

          {(expired || (formError && /session/i.test(formError))) && (
            <Alert className="mt-4" role="status">
              <TriangleAlertIcon aria-hidden className="size-4" />
              <AlertTitle>Session ended</AlertTitle>
              <AlertDescription>
                Your session expired. Sign in again to continue where you left
                off.
              </AlertDescription>
            </Alert>
          )}

          <form
            className="mt-4 space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            {formError && !/session/i.test(formError) ? (
              <Alert variant="destructive" role="alert">
                <TriangleAlertIcon aria-hidden className="size-4" />
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field data-invalid={form.formState.errors.username != null}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  {...form.register("username")}
                  aria-invalid={form.formState.errors.username != null}
                />
                {form.formState.errors.username ? (
                  <FieldError errors={[form.formState.errors.username]} />
                ) : null}
              </Field>

              <Field data-invalid={form.formState.errors.password != null}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-9"
                    {...form.register("password")}
                    aria-invalid={form.formState.errors.password != null}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-0.5 right-0.5"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((value) => !value)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-3.5" />
                    ) : (
                      <EyeIcon className="size-3.5" />
                    )}
                  </Button>
                </div>
                {form.formState.errors.password ? (
                  <FieldError errors={[form.formState.errors.password]} />
                ) : null}
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              className="w-full gap-1.5"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
              ) : null}
              {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>

            <p className="text-center text-xs">
              <Link
                to="/forgot-password"
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot your password?
              </Link>
            </p>
          </form>
        </div>

        {mocksEnabled ? (
          <div className="border border-dashed bg-card/50 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Development mock mode</p>
            <p className="mt-1">
              Any demo account below signs in with password{" "}
              <code className="rounded bg-muted px-1">Passw0rd!</code>. Mock
              mode is disabled in production builds.
            </p>
            <Separator className="my-2" />
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li
                  key={account.username}
                  className="flex items-center justify-between gap-2"
                >
                  <span>{account.role}</span>
                  <button
                    type="button"
                    className="rounded-sm underline-offset-2 hover:underline focus-visible:underline"
                    onClick={() => {
                      form.setValue("username", account.username)
                      form.setValue("password", "Passw0rd!")
                    }}
                  >
                    {account.username}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default LoginPage
