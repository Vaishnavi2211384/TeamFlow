//update file
import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email().max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});
const signInSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

const Auth = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [signUp, setSignUp] = useState({ fullName: "", email: "", password: "" });
  const [signIn, setSignIn] = useState({ email: "", password: "" });

  if (session) return <Navigate to="/" replace />;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(signUp);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: parsed.data.fullName },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome aboard!");
    navigate("/");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse(signIn);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    navigate("/");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-subtle">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-steel text-primary-foreground">
        <Link to="/auth" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-primary-foreground/10 grid place-items-center font-bold">T</div>
          <span className="font-bold text-xl">TaskFlow</span>
        </Link>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Plan projects. Assign tasks. Ship work — together.</h1>
          <p className="text-primary-foreground/70 text-lg">A focused team task manager with role-based access, due-date tracking, and discussion built in.</p>
        </div>
        <p className="text-sm text-primary-foreground/50">© TaskFlow</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-elevated">
          <h2 className="text-2xl font-bold mb-1">Get started</h2>
          <p className="text-muted-foreground text-sm mb-6">Sign in or create your account.</p>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" value={signIn.email} onChange={e => setSignIn({ ...signIn, email: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="si-pw">Password</Label>
                  <Input id="si-pw" type="password" value={signIn.password} onChange={e => setSignIn({ ...signIn, password: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" value={signUp.fullName} onChange={e => setSignUp({ ...signUp, fullName: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" value={signUp.email} onChange={e => setSignUp({ ...signUp, email: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" type="password" value={signUp.password} onChange={e => setSignUp({ ...signUp, password: e.target.value })} required />
                  <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters.</p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating..." : "Create account"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
