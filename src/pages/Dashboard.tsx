//update files
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertTriangle, ListTodo, ArrowRight, Plus } from "lucide-react";
import { format, isBefore, startOfToday } from "date-fns";

type TaskRow = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  project_id: string;
  projects: { name: string } | null;
};

const statusMeta = {
  todo: { label: "To do", className: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "In progress", className: "bg-info/15 text-info border-info/30" },
  done: { label: "Done", className: "bg-success/15 text-success border-success/30" },
} as const;

const Dashboard = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data: myTasks }, { count }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, due_date, project_id, projects(name)")
          .eq("assignee_id", user.id)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(50),
        supabase.from("projects").select("*", { count: "exact", head: true }),
      ]);
      setTasks((myTasks as any) || []);
      setProjectCount(count || 0);
      setLoading(false);
    })();
  }, [user]);

  const today = startOfToday();
  const overdue = tasks.filter(t => t.status !== "done" && t.due_date && isBefore(new Date(t.due_date), today));
  const inProgress = tasks.filter(t => t.status === "in_progress");
  const done = tasks.filter(t => t.status === "done");
  const todo = tasks.filter(t => t.status === "todo");

  const greeting = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">Hey {greeting} 👋</h1>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<ListTodo className="h-5 w-5" />} label="Assigned" value={tasks.length} />
          <StatCard icon={<Clock className="h-5 w-5 text-info" />} label="In progress" value={inProgress.length} />
          <StatCard icon={<AlertTriangle className="h-5 w-5 text-destructive" />} label="Overdue" value={overdue.length} accent={overdue.length > 0} />
          <StatCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Completed" value={done.length} />
        </div>

        {overdue.length > 0 && (
          <Card className="p-5 border-destructive/30 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold">{overdue.length} overdue task{overdue.length > 1 ? "s" : ""}</h3>
                <ul className="mt-2 space-y-1.5">
                  {overdue.slice(0, 5).map(t => (
                    <li key={t.id} className="text-sm flex items-center justify-between">
                      <Link to={`/projects/${t.project_id}`} className="hover:underline">{t.title}</Link>
                      <span className="text-xs text-destructive">due {format(new Date(t.due_date!), "MMM d")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">My tasks</h2>
            <Link to="/projects"><Button variant="ghost" size="sm">All projects <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tasks.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground mb-4">No tasks assigned to you yet.</p>
              {projectCount === 0 ? (
                <Link to="/projects"><Button><Plus className="h-4 w-4 mr-1.5" /> Create your first project</Button></Link>
              ) : (
                <Link to="/projects"><Button variant="outline">Browse projects</Button></Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...todo, ...inProgress, ...done].slice(0, 12).map(t => {
                const isOverdue = t.status !== "done" && t.due_date && isBefore(new Date(t.due_date), today);
                return (
                  <Link key={t.id} to={`/projects/${t.project_id}`} className="flex items-center justify-between py-3 hover:bg-muted/40 -mx-2 px-2 rounded">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.projects?.name}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      {t.due_date && (
                        <span className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {format(new Date(t.due_date), "MMM d")}
                        </span>
                      )}
                      <Badge variant="outline" className={statusMeta[t.status].className}>{statusMeta[t.status].label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
};

const StatCard = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) => (
  <Card className={`p-5 ${accent ? "border-destructive/40" : ""}`}>
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      {icon}
    </div>
    <p className="text-3xl font-bold mt-2">{value}</p>
  </Card>
);

export default Dashboard;
