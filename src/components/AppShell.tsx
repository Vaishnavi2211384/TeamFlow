import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FolderKanban, LogOut } from "lucide-react";
import { ReactNode } from "react";

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };
  const initials = (user?.user_metadata?.full_name || user?.email || "U")
    .split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex bg-subtle">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-steel grid place-items-center text-primary-foreground font-bold">S</div>
            <span className="font-bold text-lg tracking-tight text-sidebar-primary">Steelboard</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent text-sm font-medium">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <Link to="/projects" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent text-sm font-medium">
            <FolderKanban className="h-4 w-4" /> Projects
          </Link>
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-sidebar-accent grid place-items-center text-sm font-semibold">{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.user_metadata?.full_name || "Member"}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start mt-1 text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-steel grid place-items-center text-primary-foreground font-bold text-sm">S</div>
            <span className="font-bold tracking-tight">Steelboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/projects" className="text-sm font-medium px-2">Projects</Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </header>
        <div className="p-4 md:p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
};
