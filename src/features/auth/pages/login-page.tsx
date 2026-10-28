import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import {
  ChevronDownIcon,
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
import { cn } from "cn"

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

/**
 * Enterprise Bank brand panel (desktop only). The anniversary artwork is a
 * wide banner, so it is presented uncropped at the foot of the panel inside a
 * box that keeps its exact aspect ratio; the flat navy field above carries
 * the logo and the application identity. Hidden below `lg`, where the form
 * column shows a compact brand header instead (and never downloads the art).
 */
function BrandPanel() {
  return (
    <div className="login-brand-panel relative hidden flex-col p-8 text-white xl:p-12 lg:flex">
      <div className="bg-white w-fit p-2.5">
        <img
          src="/enterprise_bank-logo.png"
          alt="Enterprise Bank"
          width={768}
          height={153}
          className="h-8 w-auto xl:h-9"
        />
      </div>

      <div className="flex flex-1 flex-col justify-center py-12">
        <p className="text-4xl font-semibold tracking-tight xl:text-5xl">
          ALAS v3
        </p>
        <div className="login-brand-rule mt-4 h-0.5 w-10" aria-hidden />
        <p className="login-brand-muted mt-4 text-sm font-medium xl:text-base">
          Automated Loan Application System
        </p>
        <p className="login-brand-muted mt-2 max-w-[46ch] text-sm/relaxed">
          The internal workspace for loan origination, review and approval at
          Enterprise Bank.
        </p>
      </div>

      <p className="login-brand-muted mb-6 text-xs">Enterprise Bank</p>

      <div
        aria-hidden
        className="login-brand-banner -mx-8 -mb-8 aspect-[3280/1248] w-[calc(100%+4rem)] xl:-mx-12 xl:-mb-12 xl:w-[calc(100%+6rem)]"
      />
    </div>
  )
}

export function LoginPage() {
  const { status, user, login, sessionExpired } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [mockOpen, setMockOpen] = useState(false)

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

  const sessionNotice =
    expired || (formError != null && /session/i.test(formError))

  return (
    <div className="grid min-h-svh lg:grid-cols-[11fr_9fr]">
      <BrandPanel />

      <div className="bg-background flex min-h-svh flex-col lg:min-h-0">
        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[420px]">
            {/* Compact brand lockup for narrow screens; the desktop brand
                panel carries this identity at lg and above. */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img
                src="/enterprise_bank-logo.png"
                alt="Enterprise Bank"
                width={768}
                height={153}
                className="h-6 w-auto sm:h-7"
              />
              <span aria-hidden className="bg-border h-4 w-px" />
              <p className="text-sm font-semibold tracking-tight">
                ALAS v3
                <span className="text-muted-foreground hidden font-normal sm:inline">
                  {" "}
                  — Automated Loan Application System
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                Welcome back
              </h1>
              <p className="text-muted-foreground text-sm">
                Sign in to your ALAS account.
              </p>
            </div>

            {sessionNotice ? (
              <Alert className="mt-6" role="status">
                <TriangleAlertIcon aria-hidden className="size-4" />
                <AlertTitle>Session ended</AlertTitle>
                <AlertDescription>
                  Your session expired. Sign in again to continue where you
                  left off.
                </AlertDescription>
              </Alert>
            ) : null}

            <form
              className="mt-6"
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
            >
              {formError != null && !/session/i.test(formError) ? (
                <Alert variant="destructive" role="alert" className="mb-5">
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
                    className="h-10 text-sm"
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
                      className="h-10 pr-11 text-sm"
                      {...form.register("password")}
                      aria-invalid={form.formState.errors.password != null}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground absolute top-1 right-1 hover:text-foreground"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                  {form.formState.errors.password ? (
                    <FieldError errors={[form.formState.errors.password]} />
                  ) : null}
                  <div className="flex justify-end">
                    <Link
                      to="/forgot-password"
                      className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline focus-visible:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                </Field>
              </FieldGroup>

              <Button
                type="submit"
                className="mt-6 h-10 w-full gap-1.5 text-sm"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                ) : null}
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            {mocksEnabled ? (
              <div className="border-border/80 mt-8 border-t border-dashed pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground -ml-2.5 hover:text-foreground"
                  aria-expanded={mockOpen}
                  aria-controls={mockOpen ? "demo-accounts" : undefined}
                  onClick={() => setMockOpen((open) => !open)}
                >
                  <ChevronDownIcon
                    aria-hidden
                    className={cn(
                      "size-3.5 transition-transform",
                      mockOpen && "rotate-180"
                    )}
                  />
                  Development mock accounts
                </Button>
                {mockOpen ? (
                  <div
                    id="demo-accounts"
                    className="border-border/80 bg-muted/40 mt-2 border border-dashed p-3"
                  >
                    <p className="text-muted-foreground text-xs">
                      Any demo account below signs in with password{" "}
                      <code className="bg-muted rounded-sm px-1">Passw0rd!</code>
                      . Mock mode is compiled out of production builds.
                    </p>
                    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      {DEMO_ACCOUNTS.map((account) => (
                        <li
                          key={account.username}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-muted-foreground text-xs">
                            {account.role}
                          </span>
                          <button
                            type="button"
                            className="text-xs underline-offset-2 hover:underline focus-visible:underline"
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
            ) : null}
          </div>
        </main>

        <footer className="border-border/70 flex justify-center border-t px-6 py-4 sm:px-10">
          <p className="text-muted-foreground text-center text-xs">
            Authorized personnel only.
          </p>
        </footer>
      </div>
    </div>
  )
}

export default LoginPage
