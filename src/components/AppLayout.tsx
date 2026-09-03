import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, ShieldAlert, Settings, TrendingUp, LayoutDashboard } from "lucide-react";
import { cn } from "../lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/recovery", label: "Recovery Cases", icon: TrendingUp },
  { to: "/escalations", label: "Escalations", icon: ShieldAlert },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouterState();
  const pathname = router.location.pathname;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm text-sidebar-foreground">Revenue Guardian</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">AI Recovery Agent</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">Powered by Pollinations AI</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
