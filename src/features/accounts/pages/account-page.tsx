import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link } from "react-router-dom"
import {
  KeyRoundIcon,
  LoaderCircleIcon,
  MonitorIcon,
  PenLineIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAccountActivity,
  useAccountProfile,
  useAccountSessions,
  useDeleteSignature,
  useRevokeOtherSessions,
  useRevokeSession,
  useUpdateProfile,
  useUploadSignature,
  type AccountProfile,
  type UpdateProfilePayload,
} from "@/features/accounts/api/account.api"
import { formatDateTime, formatRelative } from "@/lib/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/page-header"
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from "@/components/shared/state-views"
import { StatusBadge, ToneBadge } from "@/components/shared/status-badge"

const MAX_SIGNATURE_BYTES = 1024 * 1024

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  middleName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  suffix: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  emergencyContact: z.string().trim().max(30).optional().or(z.literal("")),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export function AccountPage() {
  const profile = useAccountProfile()

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="My account"
        description="Profile details, electronic signature, active sessions and your recorded activity."
      />
      {profile.isPending ? <DetailSkeleton /> : null}
      {profile.isError || !profile.data ? (
        <ErrorState
          error={profile.error}
          onRetry={() => void profile.refetch()}
          title="Couldn't load your account"
        />
      ) : null}
      {profile.data ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="security">Security & signature</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-3">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="security" className="mt-3">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="activity" className="mt-3">
            <ActivityTab />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}

function OverviewTab() {
  const profile = useAccountProfile()
  if (!profile.data) return <DetailSkeleton />
  return <OverviewTabContent data={profile.data} />
}

function OverviewTabContent({ data }: { data: AccountProfile }) {
  const update = useUpdateProfile()
  const [editing, setEditing] = useState(false)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      firstName: data.firstName,
      middleName: data.middleName ?? "",
      lastName: data.lastName,
      suffix: data.suffix ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      emergencyContact: data.emergencyContact ?? "",
    },
  })

  function onSubmit(values: ProfileFormValues) {
    const payload: UpdateProfilePayload = {
      firstName: values.firstName,
      middleName: values.middleName || null,
      lastName: values.lastName,
      suffix: values.suffix || null,
      email: values.email,
      phone: values.phone || null,
      emergencyContact: values.emergencyContact || null,
    }
    update.mutate(payload, {
      onSuccess: () => setEditing(false),
      // On failure the dialog stays open with the entered values preserved.
    })
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 border-b py-3">
          <div>
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <CardDescription className="text-xs">
              Name and contact details. Role and branch are managed by
              administrators.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditing(true)}
          >
            <PenLineIcon aria-hidden className="size-3.5" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
            <ProfileField label="First name" value={data.firstName} />
            <ProfileField label="Middle name" value={data.middleName} />
            <ProfileField label="Last name" value={data.lastName} />
            <ProfileField label="Suffix" value={data.suffix} />
            <ProfileField label="Email" value={data.email} />
            <ProfileField label="Phone" value={data.phone} />
            <ProfileField
              label="Emergency contact"
              value={data.emergencyContact}
            />
            <ProfileField label="Username" value={data.username} mono />
            <ProfileField
              label="Branch"
              value={`${data.branchName} (${data.branchCode})`}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">Work summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Role</span>
            <ToneBadge tone="neutral">{data.role}</ToneBadge>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Job title</span>
            <span>{data.jobTitle || "—"}</span>
          </div>
          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              Applications encoded
            </span>
            <span className="tabular-nums">{data.stats.encodedLoans}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              Active this month
            </span>
            <span className="tabular-nums">{data.stats.activeThisMonth}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              Awaiting your correction
            </span>
            <span
              className={
                data.stats.pendingCorrection > 0
                  ? "font-medium text-amber-700 tabular-nums dark:text-amber-400"
                  : "tabular-nums"
              }
            >
              {data.stats.pendingCorrection}
            </span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Member since {formatDateTime(data.createdAt)} · password changed{" "}
            {formatRelative(data.passwordChangedAt)}
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={editing}
        onOpenChange={(open) => !update.isPending && setEditing(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Changes are saved to your account record. Role, branch and
              username are administrator-managed.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            {update.isError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {update.error instanceof Error
                    ? update.error.message
                    : "Save failed."}
                </AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={form.formState.errors.firstName != null}>
                  <FieldLabel htmlFor="firstName">First name</FieldLabel>
                  <Input id="firstName" {...form.register("firstName")} />
                  {form.formState.errors.firstName ? (
                    <FieldError errors={[form.formState.errors.firstName]} />
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="middleName">Middle name</FieldLabel>
                  <Input id="middleName" {...form.register("middleName")} />
                </Field>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Field data-invalid={form.formState.errors.lastName != null}>
                  <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                  <Input id="lastName" {...form.register("lastName")} />
                  {form.formState.errors.lastName ? (
                    <FieldError errors={[form.formState.errors.lastName]} />
                  ) : null}
                </Field>
                <Field className="w-24">
                  <FieldLabel htmlFor="suffix">Suffix</FieldLabel>
                  <Input
                    id="suffix"
                    placeholder="Jr, Sr, II…"
                    {...form.register("suffix")}
                  />
                </Field>
              </div>
              <Field data-invalid={form.formState.errors.email != null}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <FieldError errors={[form.formState.errors.email]} />
                ) : null}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="phone">Phone</FieldLabel>
                  <Input id="phone" {...form.register("phone")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="emergencyContact">
                    Emergency contact
                  </FieldLabel>
                  <Input
                    id="emergencyContact"
                    {...form.register("emergencyContact")}
                  />
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={update.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="gap-1.5"
                disabled={update.isPending}
              >
                {update.isPending ? (
                  <LoaderCircleIcon
                    aria-hidden
                    className="size-3.5 animate-spin"
                  />
                ) : null}
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProfileField({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate"}>
        {value || "—"}
      </dd>
    </div>
  )
}

function SecurityTab() {
  const profile = useAccountProfile()
  const upload = useUploadSignature()
  const deleteSignature = useDeleteSignature()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const data = profile.data
  if (!data) return <DetailSkeleton />

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheckIcon
              aria-hidden
              className="size-4 text-muted-foreground"
            />
            Electronic signature
          </CardTitle>
          <CardDescription className="text-xs">
            Your uploaded signature image is attached server-side to decisions
            you sign. PNG only, up to 1 MB, transparent background recommended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {data.eSignature ? (
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-44 items-center justify-center border border-border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-1 dark:bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)]">
                <img
                  src={data.eSignature}
                  alt="Your electronic signature"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="space-y-1.5">
                <ToneBadge tone="positive">On file</ToneBadge>
                <p className="text-xs text-muted-foreground">
                  Attached when you recommend, evaluate or approve.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 border border-dashed px-4 py-5">
              <div>
                <p className="text-sm font-medium">No e-signature on file</p>
                <p className="text-xs text-muted-foreground">
                  Decisions you sign will show your name and timestamp; upload a
                  signature image for printed approval forms.
                </p>
              </div>
            </div>
          )}

          {fileError ? (
            <p role="alert" className="text-xs text-destructive">
              {fileError}
            </p>
          ) : null}
          {upload.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {upload.error instanceof Error
                ? upload.error.message
                : "Upload failed."}
            </p>
          ) : null}
          {deleteSignature.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {deleteSignature.error instanceof Error
                ? deleteSignature.error.message
                : "Removal failed."}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <label>
              <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted">
                <UploadIcon aria-hidden className="size-3.5" />
                {upload.isPending
                  ? "Uploading…"
                  : data.eSignature
                    ? "Replace signature"
                    : "Upload signature"}
              </span>
              <input
                type="file"
                accept="image/png"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  setFileError(null)
                  if (!file) return
                  if (file.type !== "image/png") {
                    setFileError("The e-signature must be a PNG image.")
                    return
                  }
                  if (file.size > MAX_SIGNATURE_BYTES) {
                    setFileError("The image must be 1 MB or smaller.")
                    return
                  }
                  upload.mutate(file)
                }}
              />
            </label>
            {data.eSignature ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setConfirmRemove(true)}
                disabled={deleteSignature.isPending}
              >
                <Trash2Icon aria-hidden className="size-3.5" />
                Remove
              </Button>
            ) : null}
          </div>

          <Dialog
            open={confirmRemove}
            onOpenChange={(open) =>
              !deleteSignature.isPending && setConfirmRemove(open)
            }
          >
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Remove your e-signature?</DialogTitle>
                <DialogDescription>
                  Future decisions will no longer carry the signature image.
                  Signatures already attached to applications are preserved in
                  their records.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmRemove(false)}
                  disabled={deleteSignature.isPending}
                >
                  Keep it
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteSignature.isPending}
                  onClick={() =>
                    deleteSignature.mutate(undefined, {
                      onSuccess: () => setConfirmRemove(false),
                      onError: (error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Removal failed."
                        ),
                    })
                  }
                >
                  {deleteSignature.isPending ? "Removing…" : "Remove signature"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="border-b py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <KeyRoundIcon
                aria-hidden
                className="size-4 text-muted-foreground"
              />
              Password
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-sm">
            <p className="text-xs text-muted-foreground">
              Last changed {formatRelative(data.passwordChangedAt)}. Sessions
              end automatically when the server revokes them.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/change-password">Change password</Link>
            </Button>
          </CardContent>
        </Card>
        <SessionsCard />
      </div>
    </div>
  )
}

function SessionsCard() {
  const [page, setPage] = useState(1)
  const sessions = useAccountSessions(page)
  const revoke = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 border-b py-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MonitorIcon aria-hidden className="size-4 text-muted-foreground" />
            Active sessions
          </CardTitle>
          <CardDescription className="text-xs">
            Devices currently signed in to your account.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => revokeOthers.mutate()}
          disabled={revokeOthers.isPending || sessions.isPending}
        >
          {revokeOthers.isPending ? "Ending…" : "End others"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {sessions.isPending ? <TableSkeleton rows={2} /> : null}
        {sessions.isError ? (
          <ErrorState
            error={sessions.error}
            onRetry={() => void sessions.refetch()}
            compact
          />
        ) : null}
        {sessions.data && sessions.data.items.length === 0 ? (
          <EmptyState
            className="border-0 py-6"
            title="No other sessions"
            description="Only the session you are using right now."
          />
        ) : null}
        {sessions.data && sessions.data.items.length > 0 ? (
          <ul className="divide-y divide-border" aria-label="Sessions">
            {sessions.data.items.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {session.deviceInfo}
                    {session.isCurrent ? (
                      <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                        this device
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {session.ipAddress} · since{" "}
                    {formatRelative(session.createdAt)}
                  </span>
                </span>
                {!session.isCurrent ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="flex-none text-destructive hover:text-destructive"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    End
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {sessions.data && sessions.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              Page {sessions.data.page} of {sessions.data.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={page >= sessions.data.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ActivityTab() {
  const [page, setPage] = useState(1)
  const activity = useAccountActivity(page)

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-medium">
          My recorded activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {activity.isPending ? <TableSkeleton rows={6} /> : null}
        {activity.isError ? (
          <ErrorState
            error={activity.error}
            onRetry={() => void activity.refetch()}
          />
        ) : null}
        {activity.data && activity.data.items.length === 0 ? (
          <EmptyState
            className="border-0"
            title="No activity yet"
            description="Actions you take on applications are recorded here."
          />
        ) : null}
        {activity.data && activity.data.items.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-normal">When</TableHead>
                  <TableHead className="text-xs font-normal">
                    Application
                  </TableHead>
                  <TableHead className="text-xs font-normal">Action</TableHead>
                  <TableHead className="text-xs font-normal">
                    Transition
                  </TableHead>
                  <TableHead className="text-xs font-normal">
                    Comments
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDateTime(entry.actionDate)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <span className="font-mono text-xs">{entry.lamId}</span>
                      <span className="block max-w-40 truncate text-xs text-muted-foreground">
                        {entry.loanClientName}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm">
                      {entry.action}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {entry.fromStatus &&
                      entry.toStatus &&
                      entry.fromStatus !== entry.toStatus ? (
                        <span className="flex items-center gap-1.5">
                          <StatusBadge
                            status={entry.fromStatus}
                            withDot={false}
                          />
                          <span aria-hidden className="text-muted-foreground">
                            →
                          </span>
                          <StatusBadge
                            status={entry.toStatus}
                            withDot={false}
                          />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-64 truncate px-3 py-2 text-xs text-muted-foreground"
                      title={entry.comments ?? undefined}
                    >
                      {entry.comments ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {activity.data.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Page {activity.data.page} of {activity.data.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={page >= activity.data.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default AccountPage
