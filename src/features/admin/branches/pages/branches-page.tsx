import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { LandmarkIcon, LoaderCircleIcon } from "lucide-react"

import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  type Branch,
} from "@/features/admin/branches/api/branches.api"
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

const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^B\d{3}$/, "Branch code must look like B001."),
  name: z.string().trim().min(2, "Branch name is required.").max(120),
  areaCode: z.string().trim().min(2, "Area code is required.").max(10),
})

type BranchFormValues = z.infer<typeof branchSchema>

export function BranchesAdminPage() {
  const {
    searchInput,
    setSearchInput,
    debouncedSearch,
    page,
    setPage,
    clearSearch,
  } = usePagedSearch()
  const [dialogBranch, setDialogBranch] = useState<Branch | "new" | null>(null)
  const branches = useBranches({ page, pageSize: 10, search: debouncedSearch })

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Branch management"
        description={
          branches.data ? (
            <span className="tabular-nums">
              {branches.data.totalCount} branches
            </span>
          ) : undefined
        }
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setDialogBranch("new")}
          >
            <LandmarkIcon aria-hidden className="size-3.5" />
            New branch
          </Button>
        }
      />

      <div className="max-w-sm space-y-1">
        <Label
          htmlFor="branch-search"
          className="text-xs text-muted-foreground"
        >
          Search
        </Label>
        <Input
          id="branch-search"
          placeholder="Code, name, or area…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          autoComplete="off"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {branches.isPending ? <TableSkeleton rows={4} /> : null}
          {branches.isError ? (
            <ErrorState
              error={branches.error}
              onRetry={() => void branches.refetch()}
            />
          ) : null}
          {branches.data && branches.data.items.length === 0 ? (
            debouncedSearch ? (
              <NoSearchResultsState
                query={debouncedSearch}
                onClear={clearSearch}
                className="border-0"
              />
            ) : (
              <EmptyState
                className="border-0"
                title="No branches"
                description="Create the first branch."
              />
            )
          ) : null}
          {branches.data && branches.data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-normal">Code</TableHead>
                  <TableHead className="text-xs font-normal">Name</TableHead>
                  <TableHead className="text-xs font-normal">Area</TableHead>
                  <TableHead className="text-xs font-normal">Status</TableHead>
                  <TableHead className="text-xs font-normal">Updated</TableHead>
                  <TableHead className="w-24 text-right text-xs font-normal">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.data.items.map((branch) => (
                  <TableRow key={branch.code}>
                    <TableCell className="px-3 py-2 font-mono text-xs">
                      {branch.code}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm">
                      {branch.name}
                    </TableCell>
                    <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {branch.areaCode}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {branch.isActive ? (
                        <ToneBadge tone="positive">Active</ToneBadge>
                      ) : (
                        <ToneBadge tone="neutral">Closed</ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                      {formatDate(branch.updatedAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setDialogBranch(branch)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {branches.data && branches.data.totalPages > 1 ? (
        <nav
          className="flex items-center justify-between"
          aria-label="Branch pages"
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            Page {branches.data.page} of {branches.data.totalPages}
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
              disabled={page >= branches.data.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}

      <BranchDialog
        branch={dialogBranch}
        onClose={() => setDialogBranch(null)}
      />
    </div>
  )
}

function BranchDialog({
  branch,
  onClose,
}: {
  branch: Branch | "new" | null
  onClose: () => void
}) {
  const isNew = branch === "new"
  const existing = branch !== "new" ? branch : null
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch(existing?.code ?? "")
  const mutation = isNew ? createBranch : updateBranch

  const form = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    values: existing
      ? {
          code: existing.code,
          name: existing.name,
          areaCode: existing.areaCode,
        }
      : { code: "", name: "", areaCode: "" },
  })

  if (branch == null) return null

  function onSubmit(values: BranchFormValues) {
    if (isNew) {
      createBranch.mutate(values, { onSuccess: onClose })
    } else {
      updateBranch.mutate(
        { name: values.name, areaCode: values.areaCode },
        { onSuccess: onClose }
      )
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "New branch" : `Edit ${existing?.name}`}
          </DialogTitle>
          <DialogDescription>
            Branch codes are permanent identifiers used across applications and
            routing.
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
            <div className="space-y-1.5">
              <Label htmlFor="branch-code">Code</Label>
              <Input
                id="branch-code"
                placeholder="B005"
                disabled={!isNew}
                {...form.register("code")}
              />
              {form.formState.errors.code?.message || serverErrors.code?.[0] ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.code?.message ??
                    serverErrors.code?.[0]}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-area">Area code</Label>
              <Input
                id="branch-area"
                placeholder="NCR / VIS / MIN"
                {...form.register("areaCode")}
              />
              {form.formState.errors.areaCode?.message ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.areaCode.message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch-name">Name</Label>
            <Input
              id="branch-name"
              placeholder="e.g. Iloilo City"
              {...form.register("name")}
            />
            {form.formState.errors.name?.message || serverErrors.name?.[0] ? (
              <p role="alert" className="text-xs text-destructive">
                {form.formState.errors.name?.message ?? serverErrors.name?.[0]}
              </p>
            ) : null}
          </div>
          {existing ? (
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium">
                  {existing.isActive ? "Active" : "Closed"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Closed branches stop accepting new encodings; existing
                  applications continue their route.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={updateBranch.isPending}
                onClick={() =>
                  updateBranch.mutate({ isActive: !existing.isActive })
                }
              >
                {existing.isActive ? "Close branch" : "Reopen branch"}
              </Button>
            </div>
          ) : null}
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
              {isNew ? "Create branch" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default BranchesAdminPage
