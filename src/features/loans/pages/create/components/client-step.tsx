import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { LoaderCircleIcon, SearchIcon, UserRoundIcon } from "lucide-react"

import { useCisClient, useCisSearch } from "@/features/loans/api/cis.api"
import type { LoanCreateFormValues } from "@/features/loans/schemas/loan-create.schema"
import type { ObligationRow } from "@/features/loans/types/loan-contracts"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  EmptyState,
  ErrorState,
  NoSearchResultsState,
} from "@/components/shared/state-views"

/**
 * Step 1 — client identification. Client identity comes from CIS and is
 * read-only: the encoder confirms the record instead of retyping it.
 */
export function ClientStep({
  form,
  obligationRows,
  obligationsLoading,
}: {
  form: UseFormReturn<LoanCreateFormValues>
  obligationRows: ObligationRow[]
  obligationsLoading: boolean
}) {
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedTerm = useDebouncedValue(searchTerm, 300)
  const search = useCisSearch(debouncedTerm)
  const cisNo = form.watch("cisNo")
  const loanType = form.watch("loanType")

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm font-medium">
            Find the client in CIS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="absolute top-2 left-2.5 size-4 text-muted-foreground"
            />
            <Input
              id="cis-search"
              className="pl-8"
              placeholder="CIS number, name, or employee number"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {debouncedTerm.trim().length < 2 ? (
            <EmptyState
              className="py-6"
              title="Search to begin"
              description="Enter at least 2 characters to search the client information system."
              icon={<UserRoundIcon />}
            />
          ) : search.isPending ? (
            <div
              className="flex items-center justify-center py-6"
              role="status"
              aria-label="Searching clients"
            >
              <Spinner className="size-4" />
            </div>
          ) : search.isError ? (
            <ErrorState
              error={search.error}
              onRetry={() => void search.refetch()}
              compact
            />
          ) : search.data && search.data.items.length === 0 ? (
            <NoSearchResultsState
              query={debouncedTerm}
              onClear={() => setSearchTerm("")}
              className="py-6"
            />
          ) : (
            <ul
              aria-label="CIS search results"
              className="divide-y divide-border border border-border"
            >
              {(search.data?.items ?? []).map((item) => (
                <li key={item.cisNo}>
                  <button
                    type="button"
                    aria-pressed={item.cisNo === cisNo}
                    className={cn(
                      "w-full px-3 py-2.5 text-left hover:bg-muted/60",
                      item.cisNo === cisNo && "bg-muted"
                    )}
                    onClick={() => {
                      form.setValue("cisNo", item.cisNo, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                      form.setValue("accountNo", "", {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        CIS {item.cisNo}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.agency} · {item.positionTitle} · Emp.{" "}
                      {item.employeeNumber}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {form.formState.errors.cisNo ? (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.cisNo.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-medium">
              Client record (read-only from CIS)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {cisNo ? (
              <ClientRecord cisNo={cisNo} form={form} />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Select a client to view the record.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm font-medium">
              Application type
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <RadioGroup
              value={loanType}
              onValueChange={(value) =>
                form.setValue("loanType", value as "New" | "Reloan", {
                  shouldDirty: true,
                })
              }
              className="gap-3"
              aria-label="Loan type"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="New"
                  id="loan-type-new"
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="loan-type-new" className="font-normal">
                    New loan
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    First or standalone loan for this client.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="Reloan"
                  id="loan-type-reloan"
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="loan-type-reloan" className="font-normal">
                    Reloan
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Client has active obligations that this loan interacts with.
                  </p>
                </div>
              </div>
            </RadioGroup>

            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Existing obligations from WebLoan
                {obligationsLoading && cisNo ? (
                  <LoaderCircleIcon
                    aria-hidden
                    className="ml-1 inline size-3 animate-spin"
                  />
                ) : null}
              </p>
              {obligationRows.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {cisNo
                    ? "No active obligations on the selected account."
                    : "Select a client and account first."}
                </p>
              ) : (
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-7 text-xs font-normal">
                        PN
                      </TableHead>
                      <TableHead className="h-7 text-xs font-normal">
                        Product
                      </TableHead>
                      <TableHead className="h-7 text-right text-xs font-normal">
                        Balance
                      </TableHead>
                      <TableHead className="h-7 text-right text-xs font-normal">
                        Amort.
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {obligationRows.map((row) => (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="px-2 py-1.5 font-mono">
                          {row.pn}
                        </TableCell>
                        <TableCell className="max-w-40 truncate px-2 py-1.5">
                          {row.productWithDescription}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right tabular-nums">
                          {formatCurrency(row.outstandingBalance)}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right tabular-nums">
                          {formatCurrency(row.amortization)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ClientRecord({
  cisNo,
  form,
}: {
  cisNo: string
  form: UseFormReturn<LoanCreateFormValues>
}) {
  const client = useCisClient(cisNo)
  const accountNo = form.watch("accountNo")

  if (client.isPending) {
    return (
      <div
        className="flex items-center justify-center py-6"
        role="status"
        aria-label="Loading client record"
      >
        <Spinner className="size-4" />
      </div>
    )
  }
  if (client.isError || !client.data) {
    return (
      <ErrorState
        error={client.error}
        onRetry={() => void client.refetch()}
        compact
      />
    )
  }

  const { borrower, accounts } = client.data
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <RecordField
          label="Name"
          value={`${borrower.firstName}${borrower.middleName ? ` ${borrower.middleName[0]}.` : ""} ${borrower.lastName}${borrower.suffix ? ` ${borrower.suffix}` : ""}`}
        />
        <RecordField label="CIS number" value={borrower.cisNo} mono />
        <RecordField label="Birth date" value={borrower.birthDate} />
        <RecordField label="Marital status" value={borrower.maritalStatus} />
        <RecordField label="Agency" value={borrower.agency} />
        <RecordField label="Position" value={borrower.positionTitle} />
        <RecordField
          label="Employee no."
          value={borrower.employeeNumber}
          mono
        />
        <RecordField
          label="Length of service"
          value={borrower.lengthOfService}
        />
        <RecordField
          label="Net take-home pay"
          value={formatCurrency(borrower.netTakeHomePay)}
        />
        <RecordField label="Region" value={borrower.region} />
        <div className="col-span-2">
          <RecordField label="Address" value={borrower.address} />
        </div>
      </dl>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
          Deposit account (required for ATM credit)
        </legend>
        <RadioGroup
          value={accountNo}
          onValueChange={(value) =>
            form.setValue("accountNo", value, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
          className="gap-1.5"
          aria-label="Client accounts"
        >
          {accounts.map((account) => (
            <div
              key={account.accountNo}
              className="flex items-center gap-2 border border-border px-3 py-2 has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-muted/50"
            >
              <RadioGroupItem
                value={account.accountNo}
                id={`account-${account.accountNo}`}
              />
              <Label
                htmlFor={`account-${account.accountNo}`}
                className="flex-1 font-normal"
              >
                <span className="font-mono text-sm">{account.accountNo}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {account.branchCode} · limit{" "}
                  {account.creditLimit != null
                    ? formatCurrency(account.creditLimit)
                    : "—"}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {form.formState.errors.accountNo ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {form.formState.errors.accountNo.message}
          </p>
        ) : null}
      </fieldset>
    </div>
  )
}

function RecordField({
  label,
  value,
  mono,
}: {
  label: string
  value: string | number | null
  mono?: boolean
}) {
  const text = value == null || value === "" ? null : String(value)
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn("truncate text-sm", mono && "font-mono text-xs")}
        title={text ?? undefined}
      >
        {text ?? "—"}
      </dd>
    </div>
  )
}
