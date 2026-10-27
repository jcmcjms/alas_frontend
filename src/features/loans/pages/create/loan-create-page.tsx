import { useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router-dom"
import { CheckIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { useSession } from "@/features/auth/session-context"
import { ApiError, getErrorMessage } from "@/lib/api/api-error"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/state-views"
import { StatusBadge } from "@/components/shared/status-badge"

import { useProductOptions } from "@/features/admin/products/api/products.api"
import {
  useCisClient,
  useDeviationCatalog,
  useDocumentTemplate,
  useOutstandingLoans,
} from "@/features/loans/api/cis.api"
import { useSubmitLoanApplications } from "@/features/loans/api/loans.queries"
import {
  LOAN_CREATE_DEFAULTS,
  makeLoanCreateSchema,
  type LoanCreateFormValues,
} from "@/features/loans/schemas/loan-create.schema"
import type {
  LoanSubmissionResult,
  ObligationRow,
} from "@/features/loans/types/loan-contracts"
import { ClientStep } from "./components/client-step"
import { LoansStep } from "./components/loans-step"
import { DocumentsStep } from "./components/documents-step"
import { ReviewStep } from "./components/review-step"

const STEPS = [
  { id: 0, title: "Client", description: "Identify the borrower from CIS" },
  {
    id: 1,
    title: "Loan applications",
    description: "Products, amounts, terms, deviations",
  },
  {
    id: 2,
    title: "Documents",
    description: "Confirm the requirements on hand",
  },
  {
    id: 3,
    title: "Review & submit",
    description: "Verify everything, then submit",
  },
] as const

export function LoanCreatePage() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [result, setResult] = useState<LoanSubmissionResult | null>(null)

  // Same key on every retry of one submission; regenerated only after success
  // so a network-retry can never create a duplicate group (idempotency).
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  const {
    data: productsData,
    isPending: productsPending,
    isError: productsError,
    error: productsErr,
    refetch: refetchProducts,
  } = useProductOptions()
  const { data: templateData } = useDocumentTemplate()
  const { data: catalogData } = useDeviationCatalog()

  const products = useMemo(
    () =>
      (productsData?.items ?? [])
        .filter((product) => !product.isRetired)
        .map((product) => ({
          code: product.code,
          description: product.description,
          minAmount: product.minAmount,
          maxAmount: product.maxAmount,
          minTermDays: product.minTermDays,
          maxTermDays: product.maxTermDays,
          defaultAnnualRatePercent: product.defaultAnnualRatePercent,
          isRetired: product.isRetired,
          notarialFee: product.notarialFee,
          docStampFee: product.docStampFee,
          insuranceFee: product.insuranceFee,
          applicationChargeRate: product.applicationChargeRate,
        })),
    [productsData]
  )

  const schema = useMemo(() => makeLoanCreateSchema(products), [products])

  const form = useForm<LoanCreateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: LOAN_CREATE_DEFAULTS,
    mode: "onTouched",
  })

  const cisNo = form.watch("cisNo")
  const accountNo = form.watch("accountNo")
  const { data: cisClient } = useCisClient(cisNo || null)
  const { data: outstanding } = useOutstandingLoans(
    cisNo || null,
    accountNo || null
  )
  const submitMutation = useSubmitLoanApplications()

  const obligationRows: ObligationRow[] = useMemo(
    () =>
      (outstanding?.loans ?? []).map((loan, index) => ({
        id: `ob-${index}-${loan.pn}`,
        pn: loan.pn,
        name: null,
        principalBalance: loan.principalBalance,
        amortization: loan.amortization,
        outstandingBalance: loan.outstandingBalance,
        dateGranted: loan.dateGranted,
        dateMaturity: loan.dateMaturity,
        status: loan.status,
        productWithDescription: loan.productWithDescription,
      })),
    [outstanding]
  )
  const totalMonthlyObligations = useMemo(
    () => obligationRows.reduce((sum, row) => sum + row.amortization, 0),
    [obligationRows]
  )

  if (productsPending) {
    return (
      <div
        className="flex items-center justify-center p-12"
        role="status"
        aria-label="Loading products"
      >
        <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (productsError) {
    return (
      <div className="p-6">
        <ErrorState
          error={productsErr}
          onRetry={() => void refetchProducts()}
          title="Couldn't load the loan product catalog"
        />
      </div>
    )
  }

  async function nextStep() {
    setSubmissionError(null)
    if (step === 0) {
      const valid = await form.trigger(["cisNo", "accountNo", "loanType"])
      if (!valid) return
      if (obligationRows.length > 0 && form.getValues("loanType") === "New") {
        // Existing obligations on a New loan are allowed but worth confirming.
        const proceed = window.confirm(
          `This client has ${obligationRows.length} active loan obligation(s). Encode as "Reloan" unless a New loan is genuinely intended.\n\nContinue as New anyway?`
        )
        if (!proceed) return
      }
      setStep(1)
      return
    }
    if (step === 1) {
      const valid = await form.trigger("loans")
      if (valid) setStep(2)
      return
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  async function onSubmit(values: LoanCreateFormValues) {
    setSubmissionError(null)
    if (!cisClient || !user) {
      setSubmissionError(
        "Client details are no longer loaded. Return to step 1 and re-select the client."
      )
      return
    }
    try {
      const created = await submitMutation.mutateAsync({
        idempotencyKey: idempotencyKeyRef.current,
        cisNo: values.cisNo,
        accountNo: values.accountNo,
        branchCode: user.branchCode,
        loanType: values.loanType,
        documentsHeld: values.documentsHeld,
        client: {
          firstName: cisClient.borrower.firstName,
          middleName: cisClient.borrower.middleName,
          lastName: cisClient.borrower.lastName,
          suffix: cisClient.borrower.suffix,
          birthDate: cisClient.borrower.birthDate,
          address: cisClient.borrower.address,
          agency: cisClient.borrower.agency,
          positionTitle: cisClient.borrower.positionTitle,
          employeeNumber: cisClient.borrower.employeeNumber,
          netTakeHomePay: cisClient.borrower.netTakeHomePay,
          lengthOfService: cisClient.borrower.lengthOfService,
        },
        obligations: {
          outstandingLoans: obligationRows,
          buyOuts: [],
          ebiReloans: [],
          incomingLoans: [],
        },
        loans: values.loans.map((line) => ({
          productCode: line.productCode,
          purpose: line.purpose,
          proposedAmount: line.proposedAmount,
          termDays: line.termDays,
          annualRatePercent: line.annualRatePercent,
          deviations: line.deviations.map((deviation) => ({
            code: deviation.code,
            justification: deviation.justification,
          })),
        })),
      })
      idempotencyKeyRef.current = crypto.randomUUID()
      setResult(created)
      toast.success(
        created.loans.length > 1
          ? `Group ${created.applicationGroupNo} submitted with ${created.loans.length} applications.`
          : `${created.loans[0].lamId} submitted.`
      )
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors
        for (const [key, messages] of Object.entries(fieldErrors)) {
          // Map loans[i].field errors back onto the form fields.
          const match = /^loans\[(\d+)\]\.(\w+)$/.exec(key)
          if (match) {
            form.setError(
              `loans.${match[1]}.${match[2]}` as "loans.0.purpose",
              { message: messages[0] }
            )
          } else {
            form.setError(key as "cisNo", { message: messages[0] })
          }
        }
        if (Object.keys(fieldErrors).length > 0) {
          setSubmissionError(
            "The server rejected some fields — see the highlighted inputs."
          )
          const firstLoanIssue = Object.keys(fieldErrors).find((key) =>
            key.startsWith("loans[")
          )
          if (firstLoanIssue) setStep(1)
          return
        }
      }
      setSubmissionError(getErrorMessage(error))
    }
  }

  if (result) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <span className="flex size-8 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <CheckIcon aria-hidden className="size-4" />
            </span>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Application group submitted
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Group{" "}
            <span className="font-medium text-foreground">
              {result.applicationGroupNo}
            </span>{" "}
            — the backend routed your{" "}
            {result.loans.length === 1 ? "application" : "applications"} to the
            first review stage. Track progress from Monitoring.
          </p>
          <ul className="divide-y divide-border border border-border">
            {result.loans.map((loan) => (
              <li
                key={loan.id}
                className="flex items-center justify-between gap-3 bg-card px-4 py-3"
              >
                <span className="min-w-0">
                  <Link
                    to={`/loans/${loan.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {loan.lamId}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {loan.productCode} · ₱{loan.proposedAmount.toLocaleString()}
                  </span>
                </span>
                <StatusBadge status={loan.status} />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/loans/${result.loans[0].id}`}>Open application</Link>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setResult(null)
                setStep(0)
                form.reset(LOAN_CREATE_DEFAULTS)
              }}
            >
              Encode another
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/monitoring?mine=true")}
            >
              Go to monitoring
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title="New loan application"
        description={`Encoding for branch ${user?.branchCode ?? ""}. Fields from CIS are read-only; the backend assigns the first review stage on submission.`}
      />

      {/* Step navigation */}
      <nav aria-label="Encoding steps">
        <ol className="grid gap-px border border-border bg-border sm:grid-cols-4">
          {STEPS.map((entry) => {
            const state =
              entry.id === step ? "current" : entry.id < step ? "done" : "todo"
            return (
              <li key={entry.id} className="bg-card">
                <button
                  type="button"
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left",
                    state === "todo" ? "opacity-60" : "",
                    state === "current" && "bg-muted/60"
                  )}
                  // Only allow jumping back to completed steps; forward jumps
                  // must pass validation through Next.
                  onClick={() => entry.id < step && setStep(entry.id)}
                  disabled={entry.id > step}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 flex-none items-center justify-center border text-[11px] tabular-nums",
                      state === "done" &&
                        "border-emerald-600 bg-emerald-600 text-white",
                      state === "current" &&
                        "border-primary bg-primary text-primary-foreground",
                      state === "todo" && "border-border text-muted-foreground"
                    )}
                  >
                    {state === "done" ? (
                      <CheckIcon className="size-3" />
                    ) : (
                      entry.id + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {entry.title}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground md:block">
                      {entry.description}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {submissionError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Submission problem</AlertTitle>
          <AlertDescription>{submissionError}</AlertDescription>
        </Alert>
      ) : null}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        onKeyDown={(event) => {
          // Enter inside inputs moves forward instead of submitting early.
          if (
            event.key === "Enter" &&
            step < 3 &&
            (event.target as HTMLElement).tagName !== "TEXTAREA"
          ) {
            event.preventDefault()
            void nextStep()
          }
        }}
      >
        {step === 0 ? (
          <ClientStep
            form={form}
            obligationRows={obligationRows}
            obligationsLoading={!cisNo || outstanding === undefined}
          />
        ) : null}
        {step === 1 ? (
          <LoansStep
            form={form}
            products={products}
            catalog={catalogData?.items ?? []}
            netTakeHomePay={cisClient?.borrower.netTakeHomePay ?? null}
            totalMonthlyObligations={totalMonthlyObligations}
          />
        ) : null}
        {step === 2 ? (
          <DocumentsStep form={form} template={templateData?.items ?? []} />
        ) : null}
        {step === 3 ? (
          <ReviewStep
            form={form}
            products={products}
            catalog={catalogData?.items ?? []}
            template={templateData?.items ?? []}
            clientName={
              cisClient
                ? `${cisClient.borrower.firstName} ${cisClient.borrower.lastName}`
                : ""
            }
            netTakeHomePay={cisClient?.borrower.netTakeHomePay ?? null}
            totalMonthlyObligations={totalMonthlyObligations}
          />
        ) : null}

        <div className="mt-5 flex items-center justify-between border-t pt-4">
          {/* Keys remount the footer buttons per step: without them React
              reuses the same DOM node, so a mouseup from a "Continue" click
              can land on the node after it became "Submit" — an accidental
              premature submission (a real double-click hazard as well). */}
          <Button
            key={`back-${step}`}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0 || submitMutation.isPending}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button
              key={`next-${step}`}
              type="button"
              size="sm"
              onClick={() => void nextStep()}
            >
              Continue
            </Button>
          ) : (
            <Button
              key="submit"
              type="submit"
              size="sm"
              className="gap-1.5"
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <LoaderCircleIcon
                  aria-hidden
                  className="size-3.5 animate-spin"
                />
              ) : null}
              {submitMutation.isPending
                ? "Submitting…"
                : `Submit ${form.watch("loans")?.length ?? 0} application(s)`}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export default LoanCreatePage
