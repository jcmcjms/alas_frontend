import { Suspense, lazy } from "react"
import {
  Navigate,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom"

import { AppShell } from "@/app/layout/app-shell"
import { RequireAuth, RequirePermission } from "@/app/routes/guards"
import { PERMISSIONS } from "@/features/auth/types"
import { DetailSkeleton, TableSkeleton } from "@/components/shared/state-views"

const LoginPage = lazy(() => import("@/features/auth/pages/login-page"))
const ForgotPasswordPage = lazy(
  () => import("@/features/auth/pages/forgot-password-page")
)
const ChangePasswordPage = lazy(
  () => import("@/features/auth/pages/change-password-page")
)
const ForbiddenPage = lazy(() => import("@/features/auth/pages/forbidden-page"))
const DashboardPage = lazy(
  () => import("@/features/dashboard/pages/dashboard-page")
)
const LoanCreatePage = lazy(
  () => import("@/features/loans/pages/create/loan-create-page")
)
const LoanDetailPage = lazy(
  () => import("@/features/loans/pages/loan-detail-page")
)
const PrintApprovalFormPage = lazy(
  () => import("@/features/loans/pages/print-approval-form-page")
)
const LoanRevisePage = lazy(
  () => import("@/features/loans/pages/revise/loan-revise-page")
)
const ReviewDeskPage = lazy(
  () => import("@/features/review-desk/pages/review-desk-page")
)
const EvaluationPage = lazy(
  () => import("@/features/evaluation/pages/evaluation-page")
)
const ApprovalPage = lazy(
  () => import("@/features/approval/pages/approval-page")
)
const MonitoringPage = lazy(
  () => import("@/features/monitoring/pages/monitoring-page")
)
const DisbursementPage = lazy(
  () => import("@/features/monitoring/pages/disbursement-page")
)
const NotificationsPage = lazy(
  () => import("@/features/notifications/pages/notifications-page")
)
const AccountPage = lazy(() => import("@/features/accounts/pages/account-page"))
const UsersAdminPage = lazy(
  () => import("@/features/admin/users/pages/users-page")
)
const BranchesAdminPage = lazy(
  () => import("@/features/admin/branches/pages/branches-page")
)
const ProductsAdminPage = lazy(
  () => import("@/features/admin/products/pages/products-page")
)
const ApprovalAuthoritiesPage = lazy(
  () => import("@/features/admin/approval/pages/approval-authorities-page")
)
const WorkflowSettingsPage = lazy(
  () => import("@/features/admin/workflow/pages/workflow-settings-page")
)

function RoutePending({
  variant = "detail",
}: {
  variant?: "detail" | "table"
}) {
  return (
    <div className="p-6">
      {variant === "table" ? <TableSkeleton rows={8} /> : <DetailSkeleton />}
    </div>
  )
}

function lazyPage(
  node: React.ReactNode,
  variant: "detail" | "table" = "detail"
) {
  return (
    <Suspense fallback={<RoutePending variant={variant} />}>{node}</Suspense>
  )
}

/**
 * Route table exported separately so tests can mount the exact same routes
 * with a memory router.
 */
export const routes: RouteObject[] = [
  {
    path: "/login",
    element: lazyPage(<LoginPage />, "detail"),
  },
  {
    path: "/forgot-password",
    element: lazyPage(<ForgotPasswordPage />),
  },
  {
    path: "/forbidden",
    element: lazyPage(<ForbiddenPage />),
  },
  {
    path: "/change-password",
    element: <RequireAuth>{lazyPage(<ChangePasswordPage />)}</RequireAuth>,
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: (
          <RequirePermission
            featureName="Dashboard"
            permission={PERMISSIONS.loansView}
          >
            {lazyPage(<DashboardPage />)}
          </RequirePermission>
        ),
      },
      {
        path: "loans/new",
        element: (
          <RequirePermission
            featureName="Loan creation"
            permission={PERMISSIONS.loansCreate}
          >
            {lazyPage(<LoanCreatePage />)}
          </RequirePermission>
        ),
      },
      {
        path: "loans/:loanId",
        element: (
          <RequirePermission
            featureName="Application details"
            permission={PERMISSIONS.loansView}
          >
            {lazyPage(<LoanDetailPage />)}
          </RequirePermission>
        ),
      },
      {
        path: "loans/:loanId/print",
        element: (
          <RequirePermission
            featureName="Approval form"
            permission={PERMISSIONS.loansView}
          >
            {lazyPage(<PrintApprovalFormPage />)}
          </RequirePermission>
        ),
      },
      {
        path: "loans/:loanId/revise",
        element: (
          <RequirePermission
            featureName="Application correction"
            permission={PERMISSIONS.loansRevise}
          >
            {lazyPage(<LoanRevisePage />)}
          </RequirePermission>
        ),
      },
      {
        path: "loans/:loanId/evaluate",
        element: (
          <RequirePermission
            featureName="Evaluation"
            permission={PERMISSIONS.loansEvaluate}
          >
            {lazyPage(<EvaluationPage />)}
          </RequirePermission>
        ),
      },
      {
        path: "loans/:loanId/approve",
        element: (
          <RequirePermission
            featureName="Approval"
            permission={PERMISSIONS.loansApprove}
          >
            {lazyPage(<ApprovalPage />)}
          </RequirePermission>
        ),
      },
      {
        path: "review-desk",
        element: (
          <RequirePermission
            featureName="Review desk"
            anyOf={[
              PERMISSIONS.loansRecommend,
              PERMISSIONS.loansEvaluate,
              PERMISSIONS.loansApprove,
            ]}
          >
            {lazyPage(<ReviewDeskPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "monitoring",
        element: (
          <RequirePermission
            featureName="Monitoring"
            permission={PERMISSIONS.loansView}
          >
            {lazyPage(<MonitoringPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "monitoring/disbursement",
        element: (
          <RequirePermission
            featureName="Disbursement monitoring"
            permission={PERMISSIONS.loansView}
          >
            {lazyPage(<DisbursementPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "notifications",
        element: lazyPage(<NotificationsPage />, "table"),
      },
      {
        path: "account",
        element: lazyPage(<AccountPage />),
      },
      {
        path: "admin/users",
        element: (
          <RequirePermission
            featureName="User management"
            permission={PERMISSIONS.userManage}
          >
            {lazyPage(<UsersAdminPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "admin/branches",
        element: (
          <RequirePermission
            featureName="Branch management"
            permission={PERMISSIONS.branchManage}
          >
            {lazyPage(<BranchesAdminPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "admin/products",
        element: (
          <RequirePermission
            featureName="Loan products"
            permission={PERMISSIONS.loanProductView}
          >
            {lazyPage(<ProductsAdminPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "admin/approval-authorities",
        element: (
          <RequirePermission
            featureName="Approval authorities"
            anyOf={[
              PERMISSIONS.approvalAuthorityManage,
              PERMISSIONS.workflowManage,
            ]}
          >
            {lazyPage(<ApprovalAuthoritiesPage />, "table")}
          </RequirePermission>
        ),
      },
      {
        path: "admin/workflow",
        element: (
          <RequirePermission
            featureName="Workflow settings"
            permission={PERMISSIONS.workflowManage}
          >
            {lazyPage(<WorkflowSettingsPage />)}
          </RequirePermission>
        ),
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
