import { useMemo, useState } from "react"
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom"
import {
  BellIcon,
  CheckCheckIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useSession } from "@/features/auth/session-context"
import {
  useBellNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/features/notifications/api/notifications"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { useTheme } from "@/components/theme-provider"
import { NAV_GROUPS, type NavItem } from "@/app/layout/nav"
import { DevScenarioSwitcher } from "@/components/shared/dev-scenario-switcher"

/** Product mark: a small ledger rule motif in the accent — drawn for ALAS. */
function AlasMark() {
  return (
    <span
      aria-hidden
      className="flex size-7 flex-none items-center justify-center border border-border bg-card"
    >
      <svg viewBox="0 0 16 16" className="size-4">
        <rect x="2" y="3" width="12" height="1.6" className="fill-foreground" />
        <rect
          x="2"
          y="7.2"
          width="8"
          height="1.6"
          className="fill-muted-foreground"
        />
        <rect x="2" y="11.4" width="10" height="1.6" className="fill-primary" />
      </svg>
    </span>
  )
}

function visibleItems(
  items: NavItem[],
  hasPermission: (p: string | string[]) => boolean,
  hasAny: (p: readonly string[]) => boolean
): NavItem[] {
  return items.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false
    if (item.anyOf && !hasAny(item.anyOf)) return false
    return true
  })
}

function AppNav() {
  const { hasPermission, hasAnyPermission } = useSession()
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: visibleItems(group.items, hasPermission, hasAnyPermission),
      })).filter((group) => group.items.length > 0),
    [hasPermission, hasAnyPermission]
  )

  return (
    <SidebarContent>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={undefined}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.to}
                      end={item.exact}
                      className={({ isActive }) =>
                        cn(
                          isActive &&
                            "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        )
                      }
                    >
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data, isFetching } = useBellNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const unread = data?.unreadCount ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative"
        >
          <BellIcon aria-hidden className="size-4" />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <div className="flex items-center gap-1">
            {isFetching ? (
              <Spinner className="size-3.5 text-muted-foreground" />
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              className="gap-1 text-xs"
              onClick={() => markAll.mutate()}
              disabled={unread === 0 || markAll.isPending}
            >
              <CheckCheckIcon aria-hidden className="size-3.5" />
              Mark all read
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {data && data.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing unread right now.
            </p>
          ) : (
            <ul>
              {(data?.items ?? []).map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className="w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60"
                    onClick={() => {
                      markRead.mutate(notification.id)
                      setOpen(false)
                      if (notification.link) navigate(notification.link)
                    }}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {notification.title}
                      </span>
                      <span className="flex-none text-xs text-muted-foreground">
                        {formatRelative(notification.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {notification.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-xs"
            onClick={() => {
              setOpen(false)
              navigate("/notifications")
            }}
          >
            View all notifications
            <ChevronRightIcon aria-hidden className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <SunIcon aria-hidden className="size-4" />
      ) : (
        <MoonIcon aria-hidden className="size-4" />
      )}
    </Button>
  )
}

function UserMenu() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  if (!user) return null

  async function handleLogout() {
    setSigningOut(true)
    try {
      await logout()
      navigate("/login", { replace: true })
    } catch {
      toast.error(
        "Could not sign out cleanly. Please close the tab and sign in again."
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2"
          aria-label="Account menu"
        >
          <span className="flex size-6 flex-none items-center justify-center rounded-full bg-muted text-xs font-medium">
            {user.firstName.charAt(0)}
            {user.lastName.charAt(0)}
          </span>
          <span className="hidden max-w-32 truncate text-sm md:block">
            {user.firstName} {user.lastName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">
            {user.firstName} {user.lastName}
            {user.suffix ? ` ${user.suffix}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {user.role} · {user.branchName || user.branchCode}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => navigate("/account")}>
            <UserIcon aria-hidden className="size-4" />
            My account
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/change-password")}>
            <KeyRoundIcon aria-hidden className="size-4" />
            Change password
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void handleLogout()}
          disabled={signingOut}
        >
          <LogOutIcon aria-hidden className="size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const { user } = useSession()
  const location = useLocation()

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only absolute top-2 left-2 z-50 focus:not-sr-only focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to main content
      </a>
      <Sidebar className="border-r">
        <SidebarHeader className="border-b py-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 px-1"
            aria-label="ALAS v3 home"
          >
            <AlasMark />
            <span className="min-w-0">
              <span className="block text-sm leading-tight font-semibold tracking-tight">
                ALAS v3
              </span>
              <span className="block truncate text-xs leading-tight text-muted-foreground">
                {user?.branchName ||
                  user?.branchCode ||
                  "Loan Application System"}
              </span>
            </span>
          </Link>
        </SidebarHeader>
        <AppNav />
        <SidebarFooter className="border-t">
          <DevScenarioSwitcher />
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.role}
              </p>
            </div>
            <Badge
              variant="outline"
              className="flex-none text-[10px] font-normal"
            >
              {user?.branchCode}
            </Badge>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-12 flex-none items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1.5" aria-label="Toggle navigation" />
          <Separator
            orientation="vertical"
            className="mr-1 data-[orientation=vertical]:h-4"
          />
          <p
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            aria-live="polite"
          >
            Automated Loan Application System — internal use only
          </p>
          <span className="sr-only">{location.pathname}</span>
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </header>
        {/* SidebarInset already renders the page <main> landmark; this inner
            region is the skip-link target and must not be a second <main>. */}
        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
