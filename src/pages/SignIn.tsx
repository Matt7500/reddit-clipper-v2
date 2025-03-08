import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";

export default function SignIn() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check for signup access if in signup mode
    if (mode === "signup") {
      const hasAccess = sessionStorage.getItem("signupAccess") === "true";
      if (!hasAccess) {
        navigate("/signup");
        return;
      }
    }
  }, [mode, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode !== "signup") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/");
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
            },
          },
        });
        if (signUpError) throw signUpError;

        // Clear signup access
        sessionStorage.removeItem("signupAccess");

        // Automatically sign in after successful signup
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-4">
      <Card className="w-full max-w-md p-6 space-y-6 bg-zinc-950/50 backdrop-blur border-zinc-800">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tighter text-white">
            {mode === "signup" ? "Create an account" : "Welcome back"}
          </h1>
          <p className="text-zinc-400">
            {mode === "signup"
              ? "Enter your details to create an account"
              : "Enter your credentials to access your account"}
          </p>
        </div>
        <form onSubmit={handleAuth} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-zinc-900/50 border-zinc-800"
              />
            </div>
          )}
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-zinc-900/50 border-zinc-800"
            />
          </div>
          <div className="space-y-2 relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-zinc-900/50 border-zinc-800 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 inset-y-0 my-auto h-6 flex items-center text-zinc-400 hover:text-white transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading
              ? "Loading..."
              : mode === "signup"
              ? "Create Account"
              : "Sign In"}
          </Button>
        </form>
        <div className="text-center">
          {mode !== "signup" && (
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Don't have an account? Sign Up
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
