import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ArrowLeft, Trash2, MessageSquare, UserPlus, Crown, Calendar, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import { format, isBefore, startOfToday } from "date-fns";
import { z } from "zod";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  assignee_id: string | null;
  created_by: string;
  project_id: string;
};
type Member = {
  id: string;
  user_id: string;
  role: "admin" | "member";
  profiles?: { full_name: string | null; email: string | null } | null;
};
type Comment = {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};
type Project = { id: string; name: string; description: string | null; owner_id: string };

const STATUSES: Task["status"][] = ["todo", "in_progress", "done"];
const STATUS_LABEL = { todo: "To do", in_progress: "In progress", done: "Done" } as const;

const taskSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  description: z.string().trim().max(2000).optional(),
});

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignee_id: "unassigned", due_date: "" });
  const [memberOpen, setMemberOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  const isAdmin = members.find(m => m.user_id === user?.id)?.role === "admin";

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: t }, { data: m }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("tasks").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      supabase.from("project_members").select("id, user_id, role, profiles(full_name, email)").eq("project_id", id),
    ]);
    setProject(p as any);
    setTasks((t as any) || []);
    setMembers((m as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const memberName = (uid: string | null) => {
    if (!uid) return "Unassigned";
    const m = members.find(x => x.user_id === uid);
    return m?.profiles?.full_name || m?.profiles?.email || "Unknown";
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    const parsed = taskSchema.safeParse({ title: taskForm.title, description: taskForm.description });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const { error } = await supabase.from("tasks").insert({
      project_id: id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      assignee_id: taskForm.assignee_id === "unassigned" ? null : taskForm.assignee_id,
      due_date: taskForm.due_date || null,
      created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Task created");
    setTaskOpen(false);
    setTaskForm({ title: "", description: "", assignee_id: "unassigned", due_date: "" });
    load();
  };

  const updateTask = async (taskId: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...patch } as Task : t));
    if (openTask?.id === taskId) setOpenTask({ ...openTask, ...patch } as Task);
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    toast.success("Task deleted");
    setOpenTask(null);
    load();
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    const { data: profile, error: pErr } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (pErr || !profile) { toast.error("No user with that email. They must sign up first."); return; }
    const { error } = await supabase.from("project_members").insert({ project_id: id, user_id: profile.id, role: "member" });
    if (error) { toast.error(error.message); return; }
    toast.success("Member added");
    setInviteEmail("");
    setMemberOpen(false);
    load();
  };

  const removeMember = async (memberId: string, uid: string) => {
    if (uid === project?.owner_id) { toast.error("Cannot remove the owner."); return; }
    if (!confirm("Remove this member?")) return;
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const toggleMemberRole = async (m: Member) => {
    if (m.user_id === project?.owner_id) return;
    const newRole = m.role === "admin" ? "member" : "admin";
    const { error } = await supabase.from("project_members").update({ role: newRole }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const openTaskDialog = async (t: Task) => {
    setOpenTask(t);
    const { data } = await supabase
      .from("task_comments")
      .select("id, body, user_id, created_at, profiles(full_name, email)")
      .eq("task_id", t.id)
      .order("created_at", { ascending: true });
    setComments((data as any) || []);
  };

  const postComment = async () => {
    if (!openTask || !user || !newComment.trim()) return;
    const body = newComment.trim().slice(0, 2000);
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: openTask.id, user_id: user.id, body })
      .select("id, body, user_id, created_at, profiles(full_name, email)")
      .single();
    if (error) { toast.error(error.message); return; }
    setComments(c => [...c, data as any]);
    setNewComment("");
  };

  const today = startOfToday();
  const tasksByStatus = (s: Task["status"]) => tasks.filter(t => t.status === s);

  if (loading) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;
  if (!project) return <AppShell><p>Project not found.</p></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Projects
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
            <div>
              <h1 className="text-3xl font-bold">{project.name}</h1>
              {project.description && <p className="text-muted-foreground mt-1 max-w-2xl">{project.description}</p>}
            </div>
            <div className="flex gap-2">
              <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" /> New task</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreateTask} className="space-y-4">
                    <div>
                      <Label htmlFor="t-title">Title</Label>
                      <Input id="t-title" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} required />
                    </div>
                    <div>
                      <Label htmlFor="t-desc">Description</Label>
                      <Textarea id="t-desc" value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} rows={3} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Assignee</Label>
                        <Select value={taskForm.assignee_id} onValueChange={v => setTaskForm({ ...taskForm, assignee_id: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {members.map(m => (
                              <SelectItem key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.profiles?.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="t-due">Due date</Label>
                        <Input id="t-due" type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter><Button type="submit">Create</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Tabs defaultValue="board">
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="mt-4">
            <div className="grid md:grid-cols-3 gap-4">
              {STATUSES.map(s => (
                <div key={s} className="bg-muted/50 rounded-lg p-3 min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="font-semibold text-sm">{STATUS_LABEL[s]}</h3>
                    <Badge variant="secondary">{tasksByStatus(s).length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {tasksByStatus(s).map(t => {
                      const overdue = t.due_date && t.status !== "done" && isBefore(new Date(t.due_date), today);
                      return (
                        <button
                          key={t.id}
                          onClick={() => openTaskDialog(t)}
                          className="w-full text-left bg-card border border-border rounded-md p-3 hover:shadow-card transition-shadow"
                        >
                          <p className="font-medium text-sm">{t.title}</p>
                          <div className="flex items-center justify-between mt-2 gap-2">
                            <span className="text-xs text-muted-foreground truncate">{memberName(t.assignee_id)}</span>
                            {t.due_date && (
                              <span className={`text-xs inline-flex items-center gap-1 ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                                {format(new Date(t.due_date), "MMM d")}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {tasksByStatus(s).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Team members</h3>
                {isAdmin && (
                  <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
                    <DialogTrigger asChild><Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1.5" /> Add member</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add member</DialogTitle>
                        <DialogDescription>The user must already have an account.</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={addMember} className="space-y-4">
                        <div>
                          <Label htmlFor="inv">Email</Label>
                          <Input id="inv" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                        </div>
                        <DialogFooter><Button type="submit">Add</Button></DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              <div className="divide-y divide-border">
                {members.map(m => {
                  const isOwner = m.user_id === project.owner_id;
                  return (
                    <div key={m.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center font-semibold text-sm">
                          {(m.profiles?.full_name || m.profiles?.email || "?")[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{m.profiles?.full_name || m.profiles?.email}</p>
                          <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOwner && <Badge variant="outline" className="gap-1"><Crown className="h-3 w-3" /> Owner</Badge>}
                        <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
                        {isAdmin && !isOwner && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => toggleMemberRole(m)}>
                              Make {m.role === "admin" ? "member" : "admin"}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => removeMember(m.id, m.user_id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Task detail dialog */}
      <Dialog open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {openTask && (
            <>
              <DialogHeader>
                <DialogTitle>{openTask.title}</DialogTitle>
                {openTask.description && <DialogDescription className="whitespace-pre-wrap">{openTask.description}</DialogDescription>}
              </DialogHeader>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={openTask.status} onValueChange={(v) => updateTask(openTask.id, { status: v as Task["status"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Assignee</Label>
                  <Select value={openTask.assignee_id || "unassigned"} onValueChange={(v) => updateTask(openTask.id, { assignee_id: v === "unassigned" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.profiles?.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Due date</Label>
                  <Input type="date" value={openTask.due_date || ""} onChange={(e) => updateTask(openTask.id, { due_date: e.target.value || null })} />
                </div>
              </div>

              <div className="border-t border-border pt-4 mt-2">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comments ({comments.length})</h4>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center text-xs font-semibold shrink-0">
                        {(c.profiles?.full_name || c.profiles?.email || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{c.profiles?.full_name || c.profiles?.email}</span>
                          {" · "}{format(new Date(c.created_at), "MMM d, h:mm a")}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Input placeholder="Write a comment…" value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); postComment(); } }} />
                  <Button onClick={postComment} disabled={!newComment.trim()}><Send className="h-4 w-4" /></Button>
                </div>
              </div>

              {isAdmin && (
                <DialogFooter className="border-t border-border pt-4">
                  <Button variant="destructive" size="sm" onClick={() => deleteTask(openTask.id)}>
                    <Trash2 className="h-4 w-4 mr-1.5" /> Delete task
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

export default ProjectDetail;
