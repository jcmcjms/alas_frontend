import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router-dom"
import { LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { changePassword } from "@/features/auth/api/auth"
import { useSession } from "@/features/auth/session-context"
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

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "The new password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: "The new password must differ from the current one.",
    path: ["newPassword"],
  })

type FormValues = z.infer<typeof schema>

export function ChangePasswordPage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      await changePassword(values.currentPassword, values.newPassword)
      toast.success("Password changed.")
      navigate("/", { replace: true })
    } catch (error) {
      setServerError(getErrorMessage(error))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>
            {user?.mustChangePassword
              ? "Your administrator requires a new password before you continue."
              : "Choose a new password for your ALAS account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError ? (
            <Alert variant="destructive" className="mb-4" role="alert">
              <AlertTitle>Could not change the password</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <FieldGroup>
              <Field
                data-invalid={form.formState.errors.currentPassword != null}
              >
                <FieldLabel htmlFor="currentPassword">
                  Current password
                </FieldLabel>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("currentPassword")}
                />
                {form.formState.errors.currentPassword ? (
                  <FieldError
                    errors={[form.formState.errors.currentPassword]}
                  />
                ) : null}
              </Field>
              <Field data-invalid={form.formState.errors.newPassword != null}>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("newPassword")}
                />
                {form.formState.errors.newPassword ? (
                  <FieldError errors={[form.formState.errors.newPassword]} />
                ) : null}
              </Field>
              <Field
                data-invalid={form.formState.errors.confirmPassword != null}
              >
                <FieldLabel htmlFor="confirmPassword">
                  Confirm new password
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("confirmPassword")}
                />
                {form.formState.errors.confirmPassword ? (
                  <FieldError
                    errors={[form.formState.errors.confirmPassword]}
                  />
                ) : null}
              </Field>
            </FieldGroup>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
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
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default ChangePasswordPage
