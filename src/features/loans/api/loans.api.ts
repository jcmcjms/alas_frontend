import { apiClient, buildQuery } from "@/lib/api/api-client"
import type {
  ChecklistDocumentDto,
  ClaimResponse,
  DeskQueueResponse,
  EvaluationActionRequest,
  ExpireLoanRequest,
  LoanDetail,
  LoanHistoryEntry,
  LoanListRow,
  LoanSubmissionResult,
  PagedResult,
  PushbackActionRequest,
  ReviseLoanRequest,
  RevisionRequest,
  RoutingDto,
  SignatureRecordDto,
  SubmitLoanApplicationsRequest,
  WorkflowActionRequest,
  WorkflowConfigurationDto,
} from "@/features/loans/types/loan-contracts"

// ------------------------------------------------------------------ loans ----
export interface LoanListQuery {
  page: number
  pageSize: number
  status?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  flagged?: boolean
  mine?: boolean
  group?: string
}

export const loansApi = {
  list: (
    params: LoanListQuery,
    signal?: AbortSignal
  ): Promise<PagedResult<LoanListRow>> =>
    apiClient.get<PagedResult<LoanListRow>>(
      `/api/loans${buildQuery({
        page: params.page,
        pageSize: params.pageSize,
        status: params.status,
        search: params.search,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        flagged: params.flagged,
        mine: params.mine,
        group: params.group,
      })}`,
      { signal }
    ),

  detail: (id: string, signal?: AbortSignal): Promise<LoanDetail> =>
    apiClient.get<LoanDetail>(`/api/loans/${encodeURIComponent(id)}`, {
      signal,
    }),

  history: (id: string, signal?: AbortSignal): Promise<LoanHistoryEntry[]> =>
    apiClient.get<LoanHistoryEntry[]>(
      `/api/loans/${encodeURIComponent(id)}/history`,
      { signal }
    ),

  routing: (id: string, signal?: AbortSignal): Promise<RoutingDto> =>
    apiClient.get<RoutingDto>(`/api/loans/${encodeURIComponent(id)}/routing`, {
      signal,
    }),

  checklist: (
    id: string,
    signal?: AbortSignal
  ): Promise<{
    documents: ChecklistDocumentDto[]
    documentsComplete: boolean | null
    documentFlag: LoanDetail["documentFlag"]
  }> =>
    apiClient.get(`/api/loans/${encodeURIComponent(id)}/checklist`, { signal }),

  signatureChain: (
    id: string,
    signal?: AbortSignal
  ): Promise<{ signatures: SignatureRecordDto[] }> =>
    apiClient.get(`/api/loans/${encodeURIComponent(id)}/signature-chain`, {
      signal,
    }),

  countByStatus: (
    status: string,
    signal?: AbortSignal
  ): Promise<{ totalCount: number }> =>
    apiClient.get(`/api/loans/count${buildQuery({ status })}`, { signal }),

  submit: (
    payload: SubmitLoanApplicationsRequest,
    signal?: AbortSignal
  ): Promise<LoanSubmissionResult> =>
    apiClient.post<LoanSubmissionResult, SubmitLoanApplicationsRequest>(
      "/api/loans",
      payload,
      { signal, headers: { "Idempotency-Key": payload.idempotencyKey } }
    ),

  revise: (id: string, payload: ReviseLoanRequest): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, ReviseLoanRequest>(
      `/api/loans/${encodeURIComponent(id)}/revise`,
      payload
    ),

  revisionRequests: (
    id: string,
    signal?: AbortSignal
  ): Promise<{ items: RevisionRequest[] }> =>
    apiClient.get(`/api/loans/${encodeURIComponent(id)}/revision-requests`, {
      signal,
    }),

  cancel: (id: string, reason?: string): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, { reason?: string }>(
      `/api/loans/${encodeURIComponent(id)}/cancel`,
      { reason }
    ),

  uploadDocument: (
    id: string,
    code: string,
    file: File
  ): Promise<{
    documents: ChecklistDocumentDto[]
    documentsComplete: boolean | null
  }> => {
    const formData = new FormData()
    formData.set("file", file)
    return apiClient.upload(
      `/api/loans/${encodeURIComponent(id)}/documents/${encodeURIComponent(code)}`,
      formData
    )
  },

  removeDocument: (
    id: string,
    code: string
  ): Promise<{
    documents: ChecklistDocumentDto[]
    documentsComplete: boolean | null
  }> =>
    apiClient.delete(
      `/api/loans/${encodeURIComponent(id)}/documents/${encodeURIComponent(code)}`
    ),

  // Workflow decisions — the backend validates authority, status and rowVersion.
  recommend: (
    id: string,
    payload: WorkflowActionRequest
  ): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, WorkflowActionRequest>(
      `/api/loans/${encodeURIComponent(id)}/recommend`,
      payload
    ),

  evaluate: (
    id: string,
    payload: EvaluationActionRequest
  ): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, EvaluationActionRequest>(
      `/api/loans/${encodeURIComponent(id)}/evaluate`,
      payload
    ),

  approve: (id: string, payload: WorkflowActionRequest): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, WorkflowActionRequest>(
      `/api/loans/${encodeURIComponent(id)}/approve`,
      payload
    ),

  reject: (id: string, payload: WorkflowActionRequest): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, WorkflowActionRequest>(
      `/api/loans/${encodeURIComponent(id)}/reject`,
      payload
    ),

  pushback: (id: string, payload: PushbackActionRequest): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, PushbackActionRequest>(
      `/api/loans/${encodeURIComponent(id)}/pushback`,
      payload
    ),

  flagDocuments: (
    id: string,
    reason: string,
    rowVersion?: string
  ): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, { reason: string; rowVersion?: string }>(
      `/api/loans/${encodeURIComponent(id)}/document-flag`,
      { reason, rowVersion }
    ),

  // Disbursement lifecycle (30-day rule enforced server-side).
  prepareDisbursement: (id: string, rowVersion?: string): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, { rowVersion?: string }>(
      `/api/loans/${encodeURIComponent(id)}/disbursement/prepare`,
      { rowVersion }
    ),

  confirmDisbursement: (
    id: string,
    reference: string,
    rowVersion?: string
  ): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, { reference: string; rowVersion?: string }>(
      `/api/loans/${encodeURIComponent(id)}/disbursement/confirm`,
      { reference, rowVersion }
    ),

  expire: (id: string, payload: ExpireLoanRequest): Promise<LoanDetail> =>
    apiClient.post<LoanDetail, ExpireLoanRequest>(
      `/api/loans/${encodeURIComponent(id)}/expire`,
      payload
    ),

  syncToOngoing: (id: string): Promise<{ currentStatus: string }> =>
    apiClient.post(`/api/loans/${encodeURIComponent(id)}/sync`),
}

// --------------------------------------------------------------- desk queue --
export const deskApi = {
  queue: (signal?: AbortSignal): Promise<DeskQueueResponse> =>
    apiClient.get<DeskQueueResponse>("/api/loans/queue/my", { signal }),

  claimNext: (): Promise<ClaimResponse | null> =>
    apiClient.post<ClaimResponse | null>("/api/loans/queue/claim"),

  claimByLoan: (loanId: string): Promise<ClaimResponse> =>
    apiClient.post<ClaimResponse>(
      `/api/loans/queue/${encodeURIComponent(loanId)}/claim`
    ),

  release: (groupNo?: string): Promise<{ releasedGroups: string[] }> =>
    apiClient.post<{ releasedGroups: string[] }, { groupNo?: string }>(
      "/api/loans/queue/release",
      { groupNo }
    ),
}

// ------------------------------------------------------- workflow settings ---
export const workflowApi = {
  getConfiguration: (signal?: AbortSignal): Promise<WorkflowConfigurationDto> =>
    apiClient.get<WorkflowConfigurationDto>("/api/workflow/configuration", {
      signal,
    }),

  updateConfiguration: (
    requireRecommendation: boolean,
    expectedVersion: number
  ): Promise<WorkflowConfigurationDto> =>
    apiClient.put<
      WorkflowConfigurationDto,
      { requireRecommendation: boolean; expectedVersion: number }
    >("/api/workflow/configuration", {
      requireRecommendation,
      expectedVersion,
    }),
}
