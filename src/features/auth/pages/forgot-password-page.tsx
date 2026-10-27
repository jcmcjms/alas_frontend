import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link } from "react-router-dom"
import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react"

import { forgotPassword } from "@/features/auth/api/auth"
import { getErrorMessage } from "@/lib/api/api-error"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
})

type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  )
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  })

  async function onSubmit(values: FormValues) {
    try {
      const response = await forgotPassword(values.username)
      // Deliberately vague by design: never reveals whether the account exists.
      setResult({ ok: true, message: response.message })
    } catch (error) {
      setResult({ ok: false, message: getErrorMessage(error) })
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Reset your password</CardTitle>
          <CardDescription>
            Enter your ALAS username. If the account exists, reset instructions
            go to the registered email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <Alert
              variant={result.ok ? "default" : "destructive"}
              className="mb-4"
              role={result.ok ? "status" : "alert"}
            >
              {result.ok ? (
                <CircleCheckIcon aria-hidden className="size-4" />
              ) : null}
              <AlertTitle>
                {result.ok ? "Request received" : "Request failed"}
              </AlertTitle>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <FieldGroup>
              <Field data-invalid={form.formState.errors.username != null}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  {...form.register("username")}
                />
                {form.formState.errors.username ? (
                  <FieldError errors={[form.formState.errors.username]} />
                ) : null}
              </Field>
            </FieldGroup>
            <div className="flex items-center justify-between gap-2">
              <Link
                to="/login"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Back to sign in
              </Link>
              <Button
                type="submit"
                className="gap-1.5"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <LoaderCircleIcon
                    aria-hidden
                    className="size-4 animate-spin"
                  />
                ) : null}
                Send instructions
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default ForgotPasswordPage
