import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { apiClient, buildQuery } from "@/lib/api/api-client"
import { getErrorMessage } from "@/lib/api/api-error"
import { queryKeys } from "@/lib/query/keys"

export interface LoanProduct {
  code: string
  description: string
  minAmount: number
  maxAmount: number
  minTermDays: number
  maxTermDays: number
  notarialFee: number
  docStampFee: number
  insuranceFee: number
  advanceInterestRate: number
  applicationChargeRate: number
  amortizationMode: string
  chargeAdvanceInterest: boolean
  isRetired: boolean
  lastSyncedAt: string
  defaultAnnualRatePercent: number
}

export interface ProductListResponse {
  items: LoanProduct[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export function useProducts(params: {
  page: number
  pageSize: number
  search: string
  includeRetired?: boolean
}) {
  return useQuery({
    queryKey: queryKeys.admin.products({
      page: params.page,
      search: params.search,
    }),
    queryFn: ({ signal }) =>
      apiClient.get<ProductListResponse>(
        `/api/loan-products${buildQuery({
          page: params.page,
          pageSize: params.pageSize,
          search: params.search,
          includeRetired: params.includeRetired,
        })}`,
        { signal }
      ),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  })
}

/** Full active catalog for pickers and validation rules (reference data). */
export function useProductOptions() {
  return useQuery({
    queryKey: queryKeys.admin.productOptions,
    queryFn: ({ signal }) =>
      apiClient.get<{ items: LoanProduct[]; totalCount: number }>(
        "/api/loan-products?all=true",
        { signal }
      ),
    staleTime: 5 * 60_000,
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<LoanProduct>) =>
      apiClient.post<LoanProduct, Partial<LoanProduct>>(
        "/api/loan-products",
        payload
      ),
    onSuccess: () => {
      toast.success("Loan product created.")
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.productLists,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.productOptions,
        }),
      ])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}

export function useUpdateProduct(code: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<LoanProduct>) =>
      apiClient.put<LoanProduct, Partial<LoanProduct>>(
        `/api/loan-products/${encodeURIComponent(code)}`,
        payload
      ),
    onSuccess: () => {
      toast.success("Loan product updated.")
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.productLists,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.productOptions,
        }),
      ])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
