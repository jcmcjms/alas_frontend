import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys, type LoanListParams } from "@/lib/query/keys"
import { deskApi, loansApi, workflowApi, type LoanListQuery } from "./loans.api"
import type {
  EvaluationActionRequest,
  PushbackActionRequest,
  ReviseLoanRequest,
  SubmitLoanApplicationsRequest,
  WorkflowActionRequest,
} from "@/features/loans/types/loan-contracts"

// ------------------------------------------------------------------- queries --

export function useLoanList(params: LoanListQuery) {
  return useQuery({
    queryKey: queryKeys.loans.list(params as LoanListParams),
    queryFn: ({ signal }) => loansApi.list(params, signal),
    placeholderData: (previous) => previous, // keeps the table stable while paging
    staleTime: 15_000,
  })
}

export function useLoanDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.detail(id ?? ""),
    queryFn: ({ signal }) => loansApi.detail(id!, signal),
    enabled: Boolean(id),
    // Status and ownership are safety-critical: always revalidate on mount/focus.
    staleTime: 0,
  })
}

export function useLoanHistory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.history(id ?? ""),
    queryFn: ({ signal }) => loansApi.history(id!, signal),
    enabled: Boolean(id),
    staleTime: 30_000,
  })
}

export function useLoanRouting(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.routing(id ?? ""),
    queryFn: ({ signal }) => loansApi.routing(id!, signal),
    enabled: Boolean(id),
    staleTime: 30_000,
  })
}

export function useLoanChecklist(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.checklist(id ?? ""),
    queryFn: ({ signal }) => loansApi.checklist(id!, signal),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

export function useRevisionRequests(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.revisionRequests(id ?? ""),
    queryFn: ({ signal }) => loansApi.revisionRequests(id!, signal),
    enabled: Boolean(id),
  })
}

export function useSignatureChain(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.signatureChain(id ?? ""),
    queryFn: ({ signal }) => loansApi.signatureChain(id!, signal),
    enabled: Boolean(id),
    staleTime: 60_000,
  })
}

export function useLoanCountByStatus(status: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.loans.countByStatus(status),
    queryFn: ({ signal }) => loansApi.countByStatus(status, signal),
    enabled,
    staleTime: 15_000,
  })
}

/**
 * Desk queue: the officer's grouped bundles. Polls while visible so ownership
 * never goes stale (spec §7.7), and is invalidated by claim/release/decisions.
 */
export function useDeskQueue(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loans.desk(userId ?? "anonymous"),
    queryFn: ({ signal }) => deskApi.queue(signal),
    enabled: Boolean(userId),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

// ----------------------------------------------------------------- mutations --

/**
 * Targeted invalidation map (spec §12). Each mutation refreshes exactly the
 * server state its outcome can change — never a blanket invalidate.
 */
function useLoanInvalidation() {
  const queryClient = useQueryClient()
  return {
    /** After any workflow decision on one loan. */
    afterDecision: async (loanId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.detail(loanId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.history(loanId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.routing(loanId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.checklist(loanId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.revisionRequests(loanId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.signatureChain(loanId),
        }),
        // Queues and lists show the loan's stage/ownership.
        queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists }),
        queryClient.invalidateQueries({ queryKey: ["loans", "desk"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all,
        }),
      ])
    },
    afterQueueChange: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans", "desk"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      ])
    },
    afterDocumentsChange: async (loanId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.checklist(loanId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.loans.detail(loanId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists }),
      ])
    },
  }
}

export function useSubmitLoanApplications() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SubmitLoanApplicationsRequest) =>
      loansApi.submit(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.loans.lists }),
        queryClient.invalidateQueries({ queryKey: ["loans", "desk"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.account.myLoans }),
      ])
    },
  })
}

export function useReviseLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (payload: ReviseLoanRequest) =>
      loansApi.revise(loanId, payload),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useCancelLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (reason?: string) => loansApi.cancel(loanId, reason),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useRecommendLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (payload: WorkflowActionRequest) =>
      loansApi.recommend(loanId, payload),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useEvaluateLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (payload: EvaluationActionRequest) =>
      loansApi.evaluate(loanId, payload),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useApproveLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (payload: WorkflowActionRequest) =>
      loansApi.approve(loanId, payload),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useRejectLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (payload: WorkflowActionRequest) =>
      loansApi.reject(loanId, payload),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function usePushbackLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (payload: PushbackActionRequest) =>
      loansApi.pushback(loanId, payload),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useFlagDocuments(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: ({
      reason,
      rowVersion,
    }: {
      reason: string
      rowVersion?: string
    }) => loansApi.flagDocuments(loanId, reason, rowVersion),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useUploadDocument(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: ({ code, file }: { code: string; file: File }) =>
      loansApi.uploadDocument(loanId, code, file),
    onSuccess: () => invalidate.afterDocumentsChange(loanId),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useRemoveDocument(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (code: string) => loansApi.removeDocument(loanId, code),
    onSuccess: () => invalidate.afterDocumentsChange(loanId),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

// ------------------------------------------------------------ disbursement ---
export function usePrepareDisbursement(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (rowVersion?: string) =>
      loansApi.prepareDisbursement(loanId, rowVersion),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useConfirmDisbursement(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: ({
      reference,
      rowVersion,
    }: {
      reference: string
      rowVersion?: string
    }) => loansApi.confirmDisbursement(loanId, reference, rowVersion),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useExpireLoan(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (reason: string) => loansApi.expire(loanId, { reason }),
    onSuccess: () => invalidate.afterDecision(loanId),
  })
}

export function useSyncToOngoing(loanId: string) {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: () => loansApi.syncToOngoing(loanId),
    onSuccess: () => invalidate.afterDecision(loanId),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

// ------------------------------------------------------------------- desk ----
export function useClaimNext() {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: () => deskApi.claimNext(),
    onSuccess: (result) => {
      if (result) {
        const count = result.applications.length
        toast.success(
          count > 1
            ? `Now serving ${result.clientName}: ${count} applications in bundle ${result.groupNo}.`
            : `Now serving ${result.clientName} (${result.lamId}).`
        )
      } else {
        toast.info("Your queue is clear.")
      }
      return invalidate.afterQueueChange()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      // A failed claim usually means someone else got there first: refresh.
      return invalidate.afterQueueChange()
    },
  })
}

export function useClaimByLoan() {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (loanId: string) => deskApi.claimByLoan(loanId),
    onSuccess: (result) => {
      const count = result.applications.length
      toast.success(
        count > 1
          ? `Now serving ${result.clientName}: ${count} applications in bundle ${result.groupNo}.`
          : `Now serving ${result.clientName} (${result.lamId}).`
      )
      return invalidate.afterQueueChange()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
      return invalidate.afterQueueChange()
    },
  })
}

export function useReleaseClaim() {
  const invalidate = useLoanInvalidation()
  return useMutation({
    mutationFn: (groupNo?: string) => deskApi.release(groupNo),
    onSuccess: () => {
      toast.success("Claim released. The client is back in the queue.")
      return invalidate.afterQueueChange()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

// ------------------------------------------------------- workflow settings ---
export function useWorkflowConfiguration() {
  return useQuery({
    queryKey: queryKeys.workflow.configuration,
    queryFn: ({ signal }) => workflowApi.getConfiguration(signal),
    // Routing config must be current whenever an admin opens the screen,
    // but a 30s window avoids duplicate fetches across navigations.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useUpdateWorkflowConfiguration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      requireRecommendation,
      expectedVersion,
    }: {
      requireRecommendation: boolean
      expectedVersion: number
    }) =>
      workflowApi.updateConfiguration(requireRecommendation, expectedVersion),
    onSuccess: async () => {
      // Show only the authoritative saved configuration (no optimistic flip).
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.workflow.configuration,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      ])
    },
  })
}
