import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { verifyRotatingPassword, generateDailyPassword } from "@/utils/rotatingPassword";

export default function SignupGateway() {
  const [gatewayPassword, setGatewayPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingPassword, setGeneratingPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleGeneratePassword = async () => {
    setGeneratingPassword(true);
    try {
      await generateDailyPassword();
      toast({
        title: "Success",
        description: "Today's password has been generated and stored in Supabase",
        duration: 2000,
      });
    } catch (error: any) {
      console.error('Error generating password:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate password",
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setGeneratingPassword(false);
    }
  };

  const handleGatewaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isValid = await verifyRotatingPassword(gatewayPassword);
      
      if (isValid) {
        // Store a temporary session token
        sessionStorage.setItem('signupAccess', 'true');
        navigate("/signin?mode=signup");
      } else {
        throw new Error("Invalid gateway password");
      }
    } catch (error: any) {
      console.error('Error verifying password:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to verify password",
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
            Signup Access Required
          </h1>
          <p className="text-zinc-400">
            Please enter the gateway password to access the signup page
          </p>
        </div>
        <form onSubmit={handleGatewaySubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Gateway Password"
              value={gatewayPassword}
              onChange={(e) => setGatewayPassword(e.target.value)}
              required
              className="bg-zinc-900/50 border-zinc-800"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? "Verifying..." : "Continue to Signup"}
          </Button>
        </form>
        <div className="space-y-4 text-center">
          <Button
            type="button"
            onClick={handleGeneratePassword}
            disabled={generatingPassword}
            variant="ghost"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {generatingPassword ? "Generating..." : "Generate Today's Password"}
          </Button>
          <div>
            <button
              type="button"
              onClick={() => navigate("/signin")}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Already have an account? Sign In
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
} 