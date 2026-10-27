import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { LoaderCircleIcon, ShieldXIcon, UserPlusIcon } from "lucide-react"

import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
} from "@/features/auth/types"
import {
  useCreateUser,
  useToggleUserStatus,
  useUpdateUser,
  useUsers,
  type AdminUser,
} from "@/features/admin/users/api/users.api"
import { useBranchOptions } from "@/features/admin/branches/api/branches.api"
import { usePagedSearch } from "@/hooks/use-paged-search"
import { formatDate } from "@/lib/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/shared/page-header"
import {
  EmptyState,
  ErrorState,
  NoSearchResultsState,
  TableSkeleton,
} from "@/components/shared/state-views"
import { ToneBadge } from "@/components/shared/status-badge"

const userSchema = z.object({
  username: z.string().trim().min(3, "At least 3 characters.").max(40),
  firstName: z.string().trim().min(1, "Required.").max(80),
  middleName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().min(1, "Required.").max(80),
  suffix: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email.").max(254),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(80).optional().or(z.literal("")),
  branchCode: z.string().min(1, "Select a branch."),
  role: z.enum(ASSIGNABLE_ROLES),
})

type UserFormValues = z.infer<typeof userSchema>

export function UsersAdminPage() {
  const {
    searchInput,
    setSearchInput,
    debouncedSearch,
    page,
    setPage,
    clearSearch,
  } = usePagedSearch()
  const [dialogUser, setDialogUser] = useState<AdminUser | "new" | null>(null)
  const users = useUsers({ page, pageSize: 10, search: debouncedSearch })
  const branches = useBranchOptions()
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null)

  const toggle = useToggleUserStatus(suspendTarget?.id ?? "")

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="User management"
        description={
          users.data ? (
            <span className="tabular-nums">
              {users.data.totalCount} user
              {users.data.totalCount === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setDialogUser("new")}
          >
            <UserPlusIcon aria-hidden className="size-3.5" />
            New user
          </Button>
        }
      />

      <div className="max-w-sm space-y-1">
        <Label htmlFor="user-search" className="text-xs text-muted-foreground">
          Search
        </Label>
        <Input
          id="user-search"
          placeholder="Name, username, email, branch…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          autoComplete="off"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {users.isPending ? <TableSkeleton rows={6} /> : null}
          {users.isError ? (
            <ErrorState
              error={users.error}
              onRetry={() => void users.refetch()}
            />
          ) : null}
          {users.data && users.data.items.length === 0 ? (
            debouncedSearch ? (
              <NoSearchResultsState
                query={debouncedSearch}
                onClear={clearSearch}
                className="border-0"
              />
            ) : (
              <EmptyState
                className="border-0"
                title="No users"
                description="Create the first officer account."
              />
            )
          ) : null}
          {users.data && users.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-normal">Name</TableHead>
                  <TableHead className="text-xs font-normal">
                    Username
                  </TableHead>
                  <TableHead className="text-xs font-normal">Role</TableHead>
                  <TableHead className="text-xs font-normal">Branch</TableHead>
                  <TableHead className="text-xs font-normal">Status</TableHead>
                  <TableHead className="text-xs font-normal">Created</TableHead>
                  <TableHead className="w-40 text-right text-xs font-normal">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="px-3 py-2">
                      <span className="block text-sm font-medium">
                        {user.firstName} {user.lastName}
                        {user.suffix ? ` ${user.suffix}` : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 font-mono text-xs">
                      {user.username}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <span className="block text-xs">{user.role}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {user.jobTitle}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {user.branchCode}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {user.isActive ? (
                        <ToneBadge tone="positive">Active</ToneBadge>
                      ) : (
                        <ToneBadge tone="negative">Suspended</ToneBadge>
                      )}
                      {user.mustChangePassword ? (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          must change password
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setDialogUser(user)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className={
                            user.isActive
                              ? "text-destructive hover:text-destructive"
                              : ""
                          }
                          onClick={() => setSuspendTarget(user)}
                          aria-label={
                            user.isActive
                              ? `Suspend ${user.firstName} ${user.lastName}`
                              : `Reactivate ${user.firstName} ${user.lastName}`
                          }
                        >
                          {user.isActive ? (
                            <ShieldXIcon aria-hidden className="size-3.5" />
                          ) : (
                            "Reactivate"
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {users.data && users.data.totalPages > 1 ? (
        <nav
          className="flex items-center justify-between"
          aria-label="User pages"
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            Page {users.data.page} of {users.data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= users.data.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}

      <UserDialog
        user={dialogUser}
        onClose={() => setDialogUser(null)}
        branchOptions={(branches.data?.items ?? []).map((branch) => ({
          code: branch.code,
          name: branch.name,
        }))}
      />

      <Dialog
        open={suspendTarget != null}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {suspendTarget?.isActive ? "Suspend" : "Reactivate"}{" "}
              {suspendTarget?.firstName} {suspendTarget?.lastName}?
            </DialogTitle>
            <DialogDescription>
              {suspendTarget?.isActive
                ? "The account cannot sign in and its pending desk claims should be released. Applications already decided keep their history."
                : "The account can sign in again with its existing credentials."}
            </DialogDescription>
          </DialogHeader>
          {toggle.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {toggle.error instanceof Error
                  ? toggle.error.message
                  : "Operation failed."}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspendTarget(null)}
              disabled={toggle.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={suspendTarget?.isActive ? "destructive" : "default"}
              disabled={toggle.isPending}
              onClick={() => {
                if (!suspendTarget) return
                toggle.mutate(!suspendTarget.isActive, {
                  onSuccess: () => setSuspendTarget(null),
                })
              }}
            >
              {toggle.isPending
                ? "Working…"
                : suspendTarget?.isActive
                  ? "Suspend account"
                  : "Reactivate account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserDialog({
  user,
  onClose,
  branchOptions,
}: {
  user: AdminUser | "new" | null
  onClose: () => void
  branchOptions: { code: string; name: string }[]
}) {
  const isNew = user === "new"
  const existing = user !== "new" ? user : null
  const createUser = useCreateUser()
  const updateUser = useUpdateUser(existing?.id ?? "")
  const mutation = isNew ? createUser : updateUser

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    values: existing
      ? {
          username: existing.username,
          firstName: existing.firstName,
          middleName: existing.middleName ?? "",
          lastName: existing.lastName,
          suffix: existing.suffix ?? "",
          email: existing.email,
          phone: existing.phone ?? "",
          jobTitle: existing.jobTitle ?? "",
          branchCode: existing.branchCode,
          // Admin accounts are provisioned out-of-band; show a safe default.
          role: (ASSIGNABLE_ROLES as readonly string[]).includes(existing.role)
            ? (existing.role as UserFormValues["role"])
            : "Encoder",
        }
      : {
          username: "",
          firstName: "",
          middleName: "",
          lastName: "",
          suffix: "",
          email: "",
          phone: "",
          jobTitle: "",
          branchCode: "",
          role: "Encoder",
        },
  })

  if (user == null) return null

  function onSubmit(values: UserFormValues) {
    const payload = {
      ...values,
      middleName: values.middleName || null,
      suffix: values.suffix || null,
      phone: values.phone || null,
      jobTitle: values.jobTitle || undefined,
    }
    if (isNew) {
      createUser.mutate(payload, { onSuccess: onClose })
    } else {
      const { username: _username, ...rest } = payload
      updateUser.mutate(rest, { onSuccess: onClose })
    }
  }

  const serverErrors =
    mutation.error && "fieldErrors" in mutation.error
      ? (mutation.error as { fieldErrors: Record<string, string[]> })
          .fieldErrors
      : {}

  return (
    <Dialog
      open
      onOpenChange={(open) => !mutation.isPending && !open && onClose()}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isNew
              ? "New user"
              : `Edit ${existing?.firstName} ${existing?.lastName}`}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "A temporary password is issued; the officer must change it at first sign-in. Role changes apply the role's permission set — the server enforces them."
              : "Username and role changes take effect at the officer's next sign-in."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          {mutation.isError && Object.keys(serverErrors).length === 0 ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Save failed."}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="username"
              label="Username"
              error={
                form.formState.errors.username?.message ??
                serverErrors.username?.[0]
              }
            >
              <Input
                id="username"
                disabled={!isNew}
                {...form.register("username")}
              />
            </FormField>
            <FormField
              id="email"
              label="Email"
              error={
                form.formState.errors.email?.message ?? serverErrors.email?.[0]
              }
            >
              <Input id="email" type="email" {...form.register("email")} />
            </FormField>
            <FormField
              id="firstName"
              label="First name"
              error={form.formState.errors.firstName?.message}
            >
              <Input id="firstName" {...form.register("firstName")} />
            </FormField>
            <FormField id="middleName" label="Middle name">
              <Input id="middleName" {...form.register("middleName")} />
            </FormField>
            <FormField
              id="lastName"
              label="Last name"
              error={form.formState.errors.lastName?.message}
            >
              <Input id="lastName" {...form.register("lastName")} />
            </FormField>
            <FormField id="suffix" label="Suffix">
              <Input
                id="suffix"
                placeholder="Jr, Sr, II…"
                {...form.register("suffix")}
              />
            </FormField>
            <FormField id="phone" label="Phone">
              <Input id="phone" {...form.register("phone")} />
            </FormField>
            <FormField id="jobTitle" label="Job title">
              <Input id="jobTitle" {...form.register("jobTitle")} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="branchCode"
              label="Branch"
              error={
                form.formState.errors.branchCode?.message ??
                serverErrors.branchCode?.[0]
              }
            >
              <Select
                value={form.watch("branchCode")}
                onValueChange={(value) =>
                  form.setValue("branchCode", value, { shouldValidate: true })
                }
              >
                <SelectTrigger id="branchCode">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {branchOptions.map((branch) => (
                    <SelectItem key={branch.code} value={branch.code}>
                      {branch.code} — {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              id="role"
              label="Role"
              error={
                form.formState.errors.role?.message ?? serverErrors.role?.[0]
              }
            >
              <Select
                value={form.watch("role")}
                onValueChange={(value) =>
                  form.setValue("role", value as AssignableRole, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="gap-1.5"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <LoaderCircleIcon
                  aria-hidden
                  className="size-3.5 animate-spin"
                />
              ) : null}
              {isNew ? "Create user" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default UsersAdminPage
