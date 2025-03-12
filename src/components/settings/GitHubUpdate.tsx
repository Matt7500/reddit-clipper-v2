import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Github } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const GitHubUpdate = () => {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
    updated?: boolean;
  } | null>(null);

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      setUpdateResult(null);

      const response = await fetch('/api/update-from-github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      setUpdateResult(data);

      toast({
        title: data.success ? "Update Successful" : "Update Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
        duration: 3000,
      });

      if (data.success && data.updated) {
        toast({
          title: "Restart Required",
          description: "Please restart the application to apply the updates.",
          variant: "default",
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error updating from GitHub:', error);
      setUpdateResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });

      toast({
        title: "Update Failed",
        description: "Failed to connect to the server. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="w-full bg-[#F1F1F1]/10">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Github className="w-5 h-5 text-primary" />
          <CardTitle className="text-xl text-white">GitHub Updates</CardTitle>
        </div>
        <CardDescription className="text-gray-300">
          Update the application from the GitHub repository
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleUpdate} 
              disabled={isUpdating}
              className="flex items-center gap-2"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Update from GitHub
                </>
              )}
            </Button>
            <p className="text-sm text-gray-300">
              Pull the latest changes from the GitHub repository
            </p>
          </div>

          {updateResult && (
            <Alert variant={updateResult.success ? "default" : "destructive"}>
              <AlertTitle>
                {updateResult.success 
                  ? updateResult.updated 
                    ? "Updates Applied" 
                    : "No Updates Available" 
                  : "Update Failed"}
              </AlertTitle>
              <AlertDescription className="text-sm">
                {updateResult.message}
                {updateResult.details && (
                  <div className="mt-2 p-2 bg-black/20 rounded text-xs font-mono whitespace-pre-wrap">
                    {updateResult.details}
                  </div>
                )}
                {updateResult.success && updateResult.updated && (
                  <div className="mt-2 font-semibold">
                    Please restart the application to apply the updates.
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 