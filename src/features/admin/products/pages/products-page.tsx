import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { BoxesIcon, LoaderCircleIcon } from "lucide-react"

import {
  useCreateProduct,
  useProducts,
  useUpdateProduct,
  type LoanProduct,
} from "@/features/admin/products/api/products.api"
import { usePagedSearch } from "@/hooks/use-paged-search"
import { formatCurrency, formatDate } from "@/lib/format"
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
import { Switch } from "@/components/ui/switch"
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

const productSchema = z
  .object({
    code: z.string().trim().min(2, "Product code is required.").max(12),
    description: z.string().trim().min(3, "Description is required.").max(120),
    minAmount: z
      .number("Enter a number.")
      .finite("Enter a number.")
      .positive("Must be positive."),
    maxAmount: z
      .number("Enter a number.")
      .finite("Enter a number.")
      .positive("Must be positive."),
    minTermDays: z
      .number("Enter a number.")
      .finite("Enter a number.")
      .int()
      .min(30, "Min 30 days."),
    maxTermDays: z
      .number("Enter a number.")
      .finite("Enter a number.")
      .int()
      .min(31, "Min 31 days."),
    notarialFee: z.number("Enter a number.").finite("Enter a number.").min(0),
    docStampFee: z.number("Enter a number.").finite("Enter a number.").min(0),
    insuranceFee: z.number("Enter a number.").finite("Enter a number.").min(0),
    applicationChargeRate: z
      .number("Enter a number.")
      .finite("Enter a number.")
      .min(0)
      .max(0.2),
    defaultAnnualRatePercent: z
      .number("Enter a number.")
      .finite("Enter a number.")
      .min(0)
      .max(30),
  })
  .refine((values) => values.maxAmount > values.minAmount, {
    message: "Maximum must exceed minimum.",
    path: ["maxAmount"],
  })
  .refine((values) => values.maxTermDays > values.minTermDays, {
    message: "Maximum term must exceed minimum.",
    path: ["maxTermDays"],
  })

type ProductFormValues = z.infer<typeof productSchema>

export function ProductsAdminPage() {
  const {
    searchInput,
    setSearchInput,
    debouncedSearch,
    page,
    setPage,
    clearSearch,
  } = usePagedSearch()
  const [includeRetired, setIncludeRetired] = useState(false)
  const [dialogProduct, setDialogProduct] = useState<
    LoanProduct | "new" | null
  >(null)
  const products = useProducts({
    page,
    pageSize: 10,
    search: debouncedSearch,
    includeRetired,
  })

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Loan products"
        description={
          products.data ? (
            <span className="tabular-nums">
              {products.data.totalCount} products
            </span>
          ) : undefined
        }
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setDialogProduct("new")}
          >
            <BoxesIcon aria-hidden className="size-3.5" />
            New product
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm space-y-1">
          <Label
            htmlFor="product-search"
            className="text-xs text-muted-foreground"
          >
            Search
          </Label>
          <Input
            id="product-search"
            placeholder="Code or description…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <Switch
            id="include-retired"
            checked={includeRetired}
            onCheckedChange={setIncludeRetired}
          />
          <Label htmlFor="include-retired" className="text-xs font-normal">
            Include retired
          </Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {products.isPending ? <TableSkeleton rows={5} /> : null}
          {products.isError ? (
            <ErrorState
              error={products.error}
              onRetry={() => void products.refetch()}
            />
          ) : null}
          {products.data && products.data.items.length === 0 ? (
            debouncedSearch ? (
              <NoSearchResultsState
                query={debouncedSearch}
                onClear={clearSearch}
                className="border-0"
              />
            ) : (
              <EmptyState
                className="border-0"
                title="No products"
                description="Create the first loan product."
              />
            )
          ) : null}
          {products.data && products.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-normal">Code</TableHead>
                    <TableHead className="text-xs font-normal">
                      Description
                    </TableHead>
                    <TableHead className="text-right text-xs font-normal">
                      Amount range
                    </TableHead>
                    <TableHead className="text-right text-xs font-normal">
                      Term (days)
                    </TableHead>
                    <TableHead className="text-right text-xs font-normal">
                      Default rate
                    </TableHead>
                    <TableHead className="text-right text-xs font-normal">
                      Fees (not/doc/ins)
                    </TableHead>
                    <TableHead className="text-xs font-normal">
                      Status
                    </TableHead>
                    <TableHead className="w-20 text-right text-xs font-normal">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.data.items.map((product) => (
                    <TableRow key={product.code}>
                      <TableCell className="px-3 py-2 font-mono text-xs">
                        {product.code}
                      </TableCell>
                      <TableCell
                        className="max-w-56 truncate px-3 py-2 text-sm"
                        title={product.description}
                      >
                        {product.description}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs tabular-nums">
                        {formatCurrency(product.minAmount)} –{" "}
                        {formatCurrency(product.maxAmount)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs tabular-nums">
                        {product.minTermDays}–{product.maxTermDays}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs tabular-nums">
                        {product.defaultAnnualRatePercent}%
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right text-xs tabular-nums">
                        {product.notarialFee} / {product.docStampFee} /{" "}
                        {product.insuranceFee}
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        {product.isRetired ? (
                          <ToneBadge tone="neutral">Retired</ToneBadge>
                        ) : (
                          <ToneBadge tone="positive">Active</ToneBadge>
                        )}
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          synced {formatDate(product.lastSyncedAt)}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setDialogProduct(product)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {products.data && products.data.totalPages > 1 ? (
        <nav
          className="flex items-center justify-between"
          aria-label="Product pages"
        >
          <p className="text-xs text-muted-foreground tabular-nums">
            Page {products.data.page} of {products.data.totalPages}
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
              disabled={page >= products.data.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}

      <ProductDialog
        product={dialogProduct}
        onClose={() => setDialogProduct(null)}
      />
    </div>
  )
}

function ProductDialog({
  product,
  onClose,
}: {
  product: LoanProduct | "new" | null
  onClose: () => void
}) {
  const isNew = product === "new"
  const existing = product !== "new" ? product : null
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct(existing?.code ?? "")
  const mutation = isNew ? createProduct : updateProduct

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    values: existing
      ? {
          code: existing.code,
          description: existing.description,
          minAmount: existing.minAmount,
          maxAmount: existing.maxAmount,
          minTermDays: existing.minTermDays,
          maxTermDays: existing.maxTermDays,
          notarialFee: existing.notarialFee,
          docStampFee: existing.docStampFee,
          insuranceFee: existing.insuranceFee,
          applicationChargeRate: existing.applicationChargeRate,
          defaultAnnualRatePercent: existing.defaultAnnualRatePercent,
        }
      : {
          code: "",
          description: "",
          minAmount: 20_000,
          maxAmount: 200_000,
          minTermDays: 180,
          maxTermDays: 1080,
          notarialFee: 500,
          docStampFee: 200,
          insuranceFee: 1000,
          applicationChargeRate: 0.01,
          defaultAnnualRatePercent: 12,
        },
  })

  if (product == null) return null

  function onSubmit(values: ProductFormValues) {
    if (isNew) {
      createProduct.mutate(values, { onSuccess: onClose })
    } else {
      const { code: _code, ...rest } = values
      updateProduct.mutate(rest, { onSuccess: onClose })
    }
  }

  const serverErrors =
    mutation.error && "fieldErrors" in mutation.error
      ? (mutation.error as { fieldErrors: Record<string, string[]> })
          .fieldErrors
      : {}
  const err = (field: keyof ProductFormValues) =>
    form.formState.errors[field]?.message ?? serverErrors[field]?.[0]

  return (
    <Dialog
      open
      onOpenChange={(open) => !mutation.isPending && !open && onClose()}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "New loan product" : `Edit ${existing?.code}`}
          </DialogTitle>
          <DialogDescription>
            Limits and fees drive encoder validation and the computation
            preview. Changes apply to applications encoded after the save —
            submitted applications keep their recorded terms.
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
              <Label htmlFor="p-code">Code</Label>
              <Input id="p-code" disabled={!isNew} {...form.register("code")} />
              {err("code") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("code")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Input id="p-desc" {...form.register("description")} />
              {err("description") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("description")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-min">Min amount (₱)</Label>
              <Input
                id="p-min"
                type="number"
                step={1000}
                className="tabular-nums"
                {...form.register("minAmount", { valueAsNumber: true })}
              />
              {err("minAmount") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("minAmount")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-max">Max amount (₱)</Label>
              <Input
                id="p-max"
                type="number"
                step={1000}
                className="tabular-nums"
                {...form.register("maxAmount", { valueAsNumber: true })}
              />
              {err("maxAmount") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("maxAmount")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-minterm">Min term (days)</Label>
              <Input
                id="p-minterm"
                type="number"
                step={30}
                className="tabular-nums"
                {...form.register("minTermDays", { valueAsNumber: true })}
              />
              {err("minTermDays") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("minTermDays")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-maxterm">Max term (days)</Label>
              <Input
                id="p-maxterm"
                type="number"
                step={30}
                className="tabular-nums"
                {...form.register("maxTermDays", { valueAsNumber: true })}
              />
              {err("maxTermDays") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("maxTermDays")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-notarial">Notarial fee (₱)</Label>
              <Input
                id="p-notarial"
                type="number"
                step={50}
                className="tabular-nums"
                {...form.register("notarialFee", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-docstamp">Doc stamp (₱)</Label>
              <Input
                id="p-docstamp"
                type="number"
                step={10}
                className="tabular-nums"
                {...form.register("docStampFee", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-insurance">Insurance (₱)</Label>
              <Input
                id="p-insurance"
                type="number"
                step={50}
                className="tabular-nums"
                {...form.register("insuranceFee", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-charge">Application charge rate</Label>
              <Input
                id="p-charge"
                type="number"
                step={0.001}
                className="tabular-nums"
                {...form.register("applicationChargeRate", {
                  valueAsNumber: true,
                })}
              />
              {err("applicationChargeRate") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("applicationChargeRate")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-rate">Default annual rate (%)</Label>
              <Input
                id="p-rate"
                type="number"
                step={0.5}
                className="tabular-nums"
                {...form.register("defaultAnnualRatePercent", {
                  valueAsNumber: true,
                })}
              />
              {err("defaultAnnualRatePercent") ? (
                <p role="alert" className="text-xs text-destructive">
                  {err("defaultAnnualRatePercent")}
                </p>
              ) : null}
            </div>
          </div>
          {existing ? (
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium">
                  {existing.isRetired ? "Retired" : "Active"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Retired products cannot accept new applications but stay on
                  existing records.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={updateProduct.isPending}
                onClick={() =>
                  updateProduct.mutate({ isRetired: !existing.isRetired })
                }
              >
                {existing.isRetired ? "Reactivate" : "Retire product"}
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
              {isNew ? "Create product" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ProductsAdminPage
