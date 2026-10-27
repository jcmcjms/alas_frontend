import {
  BanknoteIcon,
  BoxesIcon,
  FilePlus2Icon,
  FolderTreeIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { PERMISSIONS } from "@/features/auth/types"

export interface NavItem {
  title: string
  to: string
  icon: LucideIcon
  permission?: string
  anyOf?: string[]
  /** Match nested routes (e.g. /monitoring vs /monitoring/disbursement). */
  exact?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", to: "/", icon: LayoutDashboardIcon, exact: true },
      {
        title: "New application",
        to: "/loans/new",
        icon: FilePlus2Icon,
        permission: PERMISSIONS.loansCreate,
      },
      {
        title: "Review desk",
        to: "/review-desk",
        icon: InboxIcon,
        anyOf: [
          PERMISSIONS.loansRecommend,
          PERMISSIONS.loansEvaluate,
          PERMISSIONS.loansApprove,
        ],
      },
      {
        title: "Monitoring",
        to: "/monitoring",
        icon: SearchIcon,
        permission: PERMISSIONS.loansView,
        exact: true,
      },
      {
        title: "Disbursement",
        to: "/monitoring/disbursement",
        icon: BanknoteIcon,
        permission: PERMISSIONS.loansView,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Users",
        to: "/admin/users",
        icon: UsersIcon,
        permission: PERMISSIONS.userManage,
      },
      {
        title: "Branches",
        to: "/admin/branches",
        icon: LandmarkIcon,
        permission: PERMISSIONS.branchManage,
      },
      {
        title: "Loan products",
        to: "/admin/products",
        icon: BoxesIcon,
        permission: PERMISSIONS.loanProductView,
      },
      {
        title: "Approval authorities",
        to: "/admin/approval-authorities",
        icon: ShieldCheckIcon,
        anyOf: [
          PERMISSIONS.approvalAuthorityManage,
          PERMISSIONS.workflowManage,
        ],
      },
      {
        title: "Workflow settings",
        to: "/admin/workflow",
        icon: WorkflowIcon,
        permission: PERMISSIONS.workflowManage,
      },
    ],
  },
]

export const NAV_ICONS = {
  notifications: InboxIcon,
  folder: FolderTreeIcon,
}
