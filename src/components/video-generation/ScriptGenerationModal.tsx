import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Play, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import type { ChannelProfile } from "@/types/channel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ScriptGenerationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChannelId: string | 'all' | null;
  channels: ChannelProfile[];
  onManualWrite: () => void;
  onGenerateVideo: (hook: string, script: string) => void;
  isGenerating: boolean;
}

export function ScriptGenerationModal({
  isOpen,
  onOpenChange,
  selectedChannelId,
  channels,
  onManualWrite,
  onGenerateVideo,
  isGenerating
}: ScriptGenerationModalProps) {
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<{ hook: string; script: string } | null>(null);
  const [editedHook, setEditedHook] = useState("");
  const [editedScript, setEditedScript] = useState("");
  const [hookCopied, setHookCopied] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>("initializing");
  const { toast } = useToast();
  const { settings: userSettings } = useUserSettings();

  // Auto-generate script when modal opens
  useEffect(() => {
    if (isOpen && !generatedScript && !isGeneratingScript) {
      handleGenerateScript();
    }
  }, [isOpen]);

  // Update edited content when generated content changes
  useEffect(() => {
    if (generatedScript) {
      setEditedHook(generatedScript.hook);
      setEditedScript(generatedScript.script);
    }
  }, [generatedScript]);

  // Progress message based on current generation step
  const getProgressMessage = () => {
    switch (generationStep) {
      case "initializing":
        return "Initializing AI models...";
      case "generating_hook":
        return "Creating an attention-grabbing hook...";
      case "generating_script":
        return "Crafting a compelling script...";
      case "finalizing":
        return "Finalizing your content...";
      default:
        return "Our AI is creating content for your video...";
    }
  };

  const handleCopyText = async (text: string, type: 'hook' | 'script') => {
    try {
      const textToCopy = type === 'hook' ? `${text} 🤔 #shorts` : text;
      await navigator.clipboard.writeText(textToCopy);
      if (type === 'hook') {
        setHookCopied(true);
        setTimeout(() => setHookCopied(false), 2000);
      } else {
        setScriptCopied(true);
        setTimeout(() => setScriptCopied(false), 2000);
      }
      toast({
        title: "Copied to clipboard",
        description: `${type === 'hook' ? 'Title' : 'Script'} has been copied to your clipboard.`,
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleGenerateScript = async () => {
    setIsGeneratingScript(true);
    setGenerationStep("initializing");
    
    try {
      // Simulate step progression
      const progressTimer = setTimeout(() => {
        setGenerationStep("generating_hook");
      }, 1500);
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openaiApiKey: userSettings.openaiApiKey,
          openrouterApiKey: userSettings.openrouterApiKey,
          openrouterModel: userSettings.openrouterModel,
        }),
      });

      // Clear the timer if response comes back quickly
      clearTimeout(progressTimer);
      
      // Update to next step - this is after the first API call which generates the hook
      setGenerationStep("generating_script");
      
      if (!response.ok) {
        throw new Error('Failed to generate script');
      }

      // Wait for the response data - this is the second API call which generates the script
      const data = await response.json();
      
      // Simulate final step
      setGenerationStep("finalizing");
      
      if (data.success) {
        setGeneratedScript({
          hook: data.hook,
          script: data.script,
        });
      } else {
        throw new Error(data.error || 'Failed to generate script');
      }
    } catch (error) {
      toast({
        title: "Error generating script",
        description: error instanceof Error ? error.message : "Something went wrong while generating the script",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsGeneratingScript(false);
      setGenerationStep("initializing"); // Reset for next time
    }
  };

  const handleUseGeneratedScript = () => {
    onGenerateVideo(editedHook, editedScript);
  };

  const handleSwitchToManual = () => {
    onManualWrite();
  };

  // Custom scrollbar styles
  const scrollbarStyles = {
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(255, 255, 255, 0.2) rgba(0, 0, 0, 0.1)',
    '&::-webkit-scrollbar': {
      width: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: 'rgba(255, 255, 255, 0.2)',
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb:hover': {
      background: 'rgba(255, 255, 255, 0.3)',
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "bg-[#222222] text-white border border-white/10 p-6 pt-10",
          isGeneratingScript 
            ? "sm:max-w-[500px]" 
            : "sm:max-w-[1000px] max-h-[90vh]"
        )} 
        autoFocus={false}
      >
        <div className="space-y-6">
          {isGeneratingScript ? (
            <div className="flex flex-col items-center justify-center py-6">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
              <h3 className="text-lg font-medium text-white mb-1">Generating Your Script</h3>
              <p className="text-sm text-zinc-400 text-center max-w-md">
                {getProgressMessage()}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Label className="text-white text-lg font-medium">Title/Hook</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-white"
                      onClick={() => handleCopyText(editedHook, 'hook')}
                    >
                      {hookCopied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {editedHook.trim() ? editedHook.trim().split(/\s+/).length : 0} words
                  </p>
                </div>
                <Input
                  value={editedHook}
                  onChange={(e) => setEditedHook(e.target.value)}
                  className="bg-[#2A2A2A] border-[#3A3A3A] text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent p-4 h-14 transition-colors"
                  placeholder="AI-generated hook will appear here..."
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Label className="text-white text-lg font-medium">Script</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-muted-foreground hover:text-white"
                      onClick={() => handleCopyText(editedScript, 'script')}
                    >
                      {scriptCopied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {editedScript.trim() ? editedScript.trim().split(/\s+/).length : 0} words
                  </p>
                </div>
                <Textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  className="resize-none min-h-[400px] bg-[#2A2A2A] border-[#3A3A3A] text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent p-4 transition-colors"
                  placeholder="AI-generated script will appear here..."
                  style={{ 
                    fontSize: '16px',
                    ...scrollbarStyles
                  }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleSwitchToManual}
                  className="flex-1 text-white hover:bg-white/10 border-2 border-white/20 bg-[#2A2A2A]"
                >
                  Write Manually
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript}
                  className="flex-1 text-white hover:bg-white/10 border-2 border-white/20 bg-[#2A2A2A] gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleUseGeneratedScript}
                  disabled={isGenerating || !editedHook.trim() || !editedScript.trim()}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Generate Video
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 