import { useQuery } from "@tanstack/react-query"

import { apiClient, buildQuery } from "@/lib/api/api-client"
import { queryKeys } from "@/lib/query/keys"

export interface CisAccount {
  accountNo: string
  accountId: string
  bankCode: string
  branchCode: string
  creditLimit: number | null
  usedCredit: number | null
  borrowerType: string
}

export interface CisSearchItem {
  cisNo: string
  name: string
  agency: string
  positionTitle: string
  employeeNumber: string
  accountCount: number
}

export interface CisBorrower {
  cisNo: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  birthDate: string
  address: string
  agencyType: string
  agency: string
  positionTitle: string
  employeeNumber: string
  netTakeHomePay: number
  lengthOfService: string
  region: string
  misAgency: string
  maritalStatus: "Single" | "Married" | "Widowed" | "Separated"
}

export interface CisClientDetail {
  borrower: CisBorrower
  accounts: CisAccount[]
}

export interface OutstandingLoanItem {
  pn: string
  productCode: string
  productWithDescription: string
  principalBalance: number
  amortization: number
  outstandingBalance: number
  dateGranted: string
  dateMaturity: string
  status: string
}

export interface DocumentTemplateItem {
  code: string
  name: string
}

export interface DeviationCatalogEntry {
  code: string
  reasonText: string
  severity: 0 | 1 | 2
  isFeeOverride: boolean
  requiresJustification: boolean
}

/** Debounced CIS client search (the caller passes an already-debounced term). */
export function useCisSearch(term: string) {
  return useQuery({
    queryKey: queryKeys.cis.search(term),
    queryFn: ({ signal }) =>
      apiClient.get<{ items: CisSearchItem[]; totalCount: number }>(
        `/api/cis/clients${buildQuery({ search: term })}`,
        { signal }
      ),
    enabled: term.trim().length >= 2,
    staleTime: 60_000,
  })
}

export function useCisClient(cisNo: string | null) {
  return useQuery({
    queryKey: queryKeys.cis.client(cisNo ?? ""),
    queryFn: ({ signal }) =>
      apiClient.get<CisClientDetail>(
        `/api/cis/clients/${encodeURIComponent(cisNo!)}`,
        { signal }
      ),
    enabled: Boolean(cisNo),
    // CIS records are reference data from an authoritative upstream system.
    staleTime: 5 * 60_000,
  })
}

export function useOutstandingLoans(
  cisNo: string | null,
  accountNo: string | null
) {
  return useQuery({
    queryKey: queryKeys.cis.outstanding(cisNo ?? "", accountNo ?? ""),
    queryFn: ({ signal }) =>
      apiClient.get<{
        cisNo: string
        accountNo: string
        loans: OutstandingLoanItem[]
      }>(
        `/api/cis/clients/${encodeURIComponent(cisNo!)}/outstanding${buildQuery({ accountNo })}`,
        { signal }
      ),
    enabled: Boolean(cisNo) && Boolean(accountNo),
    staleTime: 60_000,
  })
}

export function useDocumentTemplate() {
  return useQuery({
    queryKey: ["document-template"] as const,
    queryFn: ({ signal }) =>
      apiClient.get<{ items: DocumentTemplateItem[] }>(
        "/api/document-template",
        { signal }
      ),
    staleTime: 10 * 60_000,
  })
}

export function useDeviationCatalog() {
  return useQuery({
    queryKey: queryKeys.admin.deviationCatalog,
    queryFn: ({ signal }) =>
      apiClient.get<{ items: DeviationCatalogEntry[] }>(
        "/api/deviation-catalog",
        { signal }
      ),
    staleTime: 10 * 60_000,
  })
}
