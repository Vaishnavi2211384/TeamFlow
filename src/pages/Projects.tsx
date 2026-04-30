import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, FolderKanban, Crown } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

type Project = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
};

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(80),
  description: z.string().trim().max(500).optional(),
});

const Projects = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = projectSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setCreating(true);
    const { error } = await supabase.from("projects").insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      owner_id: user.id,
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Project created");
    setOpen(false);
    setForm({ name: "", description: "" });
    load();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground mt-1">Workspaces for your team's work.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" /> New project</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create project</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="p-name">Name</Label>
                  <Input id="p-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="p-desc">Description</Label>
                  <Textarea id="p-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No projects yet</h3>
            <p className="text-muted-foreground mb-5">Create your first project to start collaborating.</p>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New project</Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="p-5 h-full hover:shadow-card transition-shadow group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-md bg-steel grid place-items-center text-primary-foreground font-bold">
                      {p.name[0]?.toUpperCase()}
                    </div>
                    {p.owner_id === user?.id && (
                      <Badge variant="outline" className="gap-1"><Crown className="h-3 w-3" /> Owner</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mt-4 group-hover:underline">{p.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{p.description || "No description"}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default Projects;
