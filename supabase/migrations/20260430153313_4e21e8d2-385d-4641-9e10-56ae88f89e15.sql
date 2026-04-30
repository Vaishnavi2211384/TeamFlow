
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.project_role AS ENUM ('admin', 'member');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'done');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES (global) ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============ PROJECT MEMBERS ============
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date DATE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);

-- ============ TASK COMMENTS ============
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_comments_task ON public.task_comments(task_id);

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_project_admin(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.task_project_id(_task_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.tasks WHERE id = _task_id;
$$;

CREATE OR REPLACE FUNCTION public.shares_project_with(_a UUID, _b UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm1
    JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = _a AND pm2.user_id = _b
  );
$$;

-- ============ PROFILE / ROLE AUTO-CREATE ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PROJECT OWNER AUTO-MEMBER ============
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_project_created
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "View own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "View profiles in shared projects" ON public.profiles FOR SELECT USING (public.shares_project_with(auth.uid(), id));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- user_roles (read-only for self)
CREATE POLICY "View own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- projects
CREATE POLICY "Members view projects" ON public.projects FOR SELECT
  USING (public.is_project_member(id, auth.uid()));
CREATE POLICY "Authenticated create projects" ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Project admins update" ON public.projects FOR UPDATE
  USING (public.is_project_admin(id, auth.uid()));
CREATE POLICY "Owner deletes project" ON public.projects FOR DELETE
  USING (auth.uid() = owner_id);

-- project_members
CREATE POLICY "Members view membership" ON public.project_members FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project admins add members" ON public.project_members FOR INSERT
  WITH CHECK (public.is_project_admin(project_id, auth.uid()));
CREATE POLICY "Project admins update members" ON public.project_members FOR UPDATE
  USING (public.is_project_admin(project_id, auth.uid()));
CREATE POLICY "Project admins remove members" ON public.project_members FOR DELETE
  USING (public.is_project_admin(project_id, auth.uid()));

-- tasks
CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members create tasks" ON public.tasks FOR INSERT
  WITH CHECK (public.is_project_member(project_id, auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project admins delete tasks" ON public.tasks FOR DELETE
  USING (public.is_project_admin(project_id, auth.uid()));

-- task_comments
CREATE POLICY "Members view comments" ON public.task_comments FOR SELECT
  USING (public.is_project_member(public.task_project_id(task_id), auth.uid()));
CREATE POLICY "Members create comments" ON public.task_comments FOR INSERT
  WITH CHECK (public.is_project_member(public.task_project_id(task_id), auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "Authors update own comments" ON public.task_comments FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Authors delete own comments" ON public.task_comments FOR DELETE
  USING (auth.uid() = user_id);
