import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Play, Loader2, ArrowLeft, ArrowRight, CheckCircle2, Check, Sparkles, Wand2 } from "lucide-react";
import type { ChannelProfile } from "@/types/channel";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useToast } from "@/components/ui/use-toast";
import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define available models for the dropdown
const OPENROUTER_MODELS = [
  { id: "anthropic/claude-3.7-sonnet:thinking", name: "Claude 3.7 Sonnet (Thinking)" },
  { id: "anthropic/claude-3.7-sonnet:beta", name: "Claude 3.7 Sonnet" },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini Flash 2.0" },
  { id: "google/gemini-2.0-pro-exp-02-05:free", name: "Gemini Pro 2.0" },
  { id: "openai/gpt-4o-2024-11-20", name: "ChatGPT 4o (2024-11-20)" },
  { id: "openai/chatgpt-4o-latest", name: "ChatGPT 4o" },
];

// Default model for generation
const DEFAULT_MODEL = "anthropic/claude-3.7-sonnet:thinking";

interface ChannelScript {
  channelId: string;
  hook: string;
  script: string;
  expanded: boolean;
}

interface MultiChannelScriptModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  channels: ChannelProfile[];
  onGenerate: (channelScripts: ChannelScript[]) => void;
  isGenerating: boolean;
}

export function MultiChannelScriptModal({
  isOpen,
  onOpenChange,
  channels,
  onGenerate,
  isGenerating
}: MultiChannelScriptModalProps) {
  const { settings } = useUserSettings();
  const { toast } = useToast();
  const [channelScripts, setChannelScripts] = useState<ChannelScript[]>(() => 
    channels.map(channel => ({
      channelId: channel.id,
      hook: "",
      script: "",
      expanded: true
    }))
  );
  const [activeTab, setActiveTab] = useState<string>(channels.length > 0 ? channels[0].id : "");
  const [completedAnimations, setCompletedAnimations] = useState<Record<string, boolean>>({});
  const [generatingSingleChannel, setGeneratingSingleChannel] = useState<string | null>(null);
  const [generatingScriptFromHook, setGeneratingScriptFromHook] = useState<string | null>(null);
  const [generatingHook, setGeneratingHook] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState<'initializing' | 'generating_hook' | 'generating_script' | 'finalizing'>('initializing');
  const [isClosing, setIsClosing] = useState(false);
  
  // New state for model selection
  const [hookModel, setHookModel] = useState<string>(settings.openrouterModel || DEFAULT_MODEL);
  const [scriptModel, setScriptModel] = useState<string>(settings.openrouterModel || DEFAULT_MODEL);

  // Simple handler for closing the modal
  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Handler for back to channels button
  const handleBackToChannels = React.useCallback(() => {
    // Start closing animation
    setIsClosing(true);
    
    // Wait for animation to complete before actually closing
    setTimeout(() => {
      // Close this modal
      onOpenChange(false);
      setIsClosing(false);
    }, 200); // Match this with the animation duration
  }, [onOpenChange]);

  // Initialize model selections from user settings
  useEffect(() => {
    if (settings.openrouterModel) {
      setHookModel(settings.openrouterModel);
      setScriptModel(settings.openrouterModel);
    } else {
      // If no user settings, ensure we use the default model
      setHookModel(DEFAULT_MODEL);
      setScriptModel(DEFAULT_MODEL);
    }
  }, [settings.openrouterModel]);

  // Reset channel scripts when channels change
  useEffect(() => {
    setChannelScripts(channels.map(channel => ({
      channelId: channel.id,
      hook: "",
      script: "",
      expanded: true
    })));
    if (channels.length > 0 && !channels.find(c => c.id === activeTab)) {
      setActiveTab(channels[0].id);
    }
  }, [channels]);

  // Track content completion and trigger animations
  useEffect(() => {
    const newCompletedAnimations: Record<string, boolean> = {};
    
    channelScripts.forEach(cs => {
      const wasComplete = completedAnimations[cs.channelId];
      const isComplete = cs.hook.trim() !== "" && cs.script.trim() !== "";
      
      // Only trigger animation when transitioning from incomplete to complete
      if (!wasComplete && isComplete) {
        newCompletedAnimations[cs.channelId] = true;
      }
    });
    
    if (Object.keys(newCompletedAnimations).length > 0) {
      // Add a small delay to ensure the tab expansion happens first
      setTimeout(() => {
        setCompletedAnimations(prev => ({
          ...prev,
          ...newCompletedAnimations
        }));
      }, 100);
    }
  }, [channelScripts]);

  const handleHookChange = (channelId: string, hook: string) => {
    setChannelScripts(prev => 
      prev.map(cs => 
        cs.channelId === channelId ? { ...cs, hook } : cs
      )
    );
  };

  const handleScriptChange = (channelId: string, script: string) => {
    setChannelScripts(prev => 
      prev.map(cs => 
        cs.channelId === channelId ? { ...cs, script } : cs
      )
    );
  };

  const handleGenerateAll = () => {
    // Filter out any channels with empty scripts
    const validScripts = channelScripts.filter(cs => 
      cs.hook.trim() !== "" && cs.script.trim() !== ""
    );
    
    if (validScripts.length === 0) {
      // Show error or toast
      return;
    }
    
    onGenerate(validScripts);
  };

  // Handle generating just the hook
  const handleGenerateHook = async (channelId: string) => {
    // Validate API keys - prioritize OpenRouter
    if (!settings.openrouterApiKey && !settings.openaiApiKey) {
      toast({
        title: "API Key Required",
        description: "Please add an OpenRouter or OpenAI API key in your settings to generate scripts.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    setGeneratingHook(channelId);
    setGenerationProgress(0);
    setGenerationStep('initializing');
    
    try {
      // Start progress animation
      setTimeout(() => {
        setGenerationStep('generating_hook');
        setGenerationProgress(25);
      }, 500);
      
      // Make API call to generate hook only
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openaiApiKey: settings.openaiApiKey,
          openrouterApiKey: settings.openrouterApiKey,
          openrouterModel: hookModel,
          hookOnly: true, // Signal we only want the hook
        }),
      });
      
      // Update progress
      setGenerationProgress(60);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate hook');
      }
      
      // Get response data
      const data = await response.json();
      
      // Final progress step
      setGenerationStep('finalizing');
      setGenerationProgress(90);
      
      if (data.success) {
        // Short delay to show the finalizing step
        setTimeout(() => {
          // Update the channel hook with the generated content
          handleHookChange(channelId, data.hook);
          
          // Complete the progress
          setGenerationProgress(100);
          
          // Reset after a short delay
          setTimeout(() => {
            setGeneratingHook(null);
            setGenerationProgress(0);
            setGenerationStep('initializing');
          }, 500);
        }, 500);
      } else {
        throw new Error(data.error || 'Failed to generate hook');
      }
    } catch (error) {
      toast({
        title: "Error generating hook",
        description: error instanceof Error ? error.message : "Something went wrong while generating the hook",
        variant: "destructive",
        duration: 5000,
      });
      setGeneratingHook(null);
      setGenerationProgress(0);
      setGenerationStep('initializing');
    }
  };

  // Generate just the script (for a channel that already has a hook)
  const handleGenerateScript = async (channelId: string) => {
    // Get the current hook for this channel
    const currentHook = channelScripts.find(cs => cs.channelId === channelId)?.hook;

    // Validate the hook
    if (!currentHook || currentHook.trim() === "") {
      toast({
        title: "Hook Required",
        description: "Please enter a hook first before generating a script.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    // Validate API keys - prioritize OpenRouter
    if (!settings.openrouterApiKey && !settings.openaiApiKey) {
      toast({
        title: "API Key Required",
        description: "Please add an OpenRouter or OpenAI API key in your settings to generate scripts.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }

    setGeneratingSingleChannel(channelId);
    setGenerationProgress(0);
    setGenerationStep('initializing');
    
    try {
      // Start progress animation
      setTimeout(() => {
        setGenerationStep('generating_script');
        setGenerationProgress(30);
      }, 300);
      
      // Make API call to generate script based on the hook
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/generate-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openaiApiKey: settings.openaiApiKey,
          openrouterApiKey: settings.openrouterApiKey,
          openrouterModel: scriptModel,
          customHook: currentHook,
        }),
      });
      
      // Update progress
      setGenerationProgress(70);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate script');
      }
      
      // Get response data
      const data = await response.json();
      
      // Final progress step
      setGenerationStep('finalizing');
      setGenerationProgress(90);
      
      if (data.success) {
        // Short delay to show the finalizing step
        setTimeout(() => {
          // Update the script, keeping the original hook
          handleScriptChange(channelId, data.script);
          
          // Complete the progress
          setGenerationProgress(100);
          
          // Reset after a short delay
          setTimeout(() => {
            setGeneratingSingleChannel(null);
            setGenerationProgress(0);
            setGenerationStep('initializing');
          }, 500);
        }, 500);
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
      setGeneratingSingleChannel(null);
      setGenerationProgress(0);
      setGenerationStep('initializing');
    }
  };

  const isValid = channelScripts.some(cs => 
    cs.hook.trim() !== "" && cs.script.trim() !== ""
  );

  // Check if any kind of generation is happening
  const isAnyGenerationActive = generatingSingleChannel !== null || generatingHook !== null;

  // Count how many channels have content
  const channelsWithContent = channelScripts.filter(cs => 
    cs.hook.trim() !== "" && cs.script.trim() !== ""
  ).length;

  // Check generation type for a specific channel
  const getGenerationTypeForChannel = (channelId: string) => {
    if (generatingHook === channelId) return 'hook';
    if (generatingSingleChannel === channelId) return 'script';
    return null;
  };

  // Navigation functions
  const goToNextChannel = () => {
    const currentIndex = channels.findIndex(c => c.id === activeTab);
    if (currentIndex < channels.length - 1) {
      setActiveTab(channels[currentIndex + 1].id);
    }
  };

  const goToPreviousChannel = () => {
    const currentIndex = channels.findIndex(c => c.id === activeTab);
    if (currentIndex > 0) {
      setActiveTab(channels[currentIndex - 1].id);
    }
  };

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goToNextChannel();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goToPreviousChannel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab, channels]);

  // Create a custom DialogContent component without the close button
  const CustomDialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
  >(({ className, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        {...props}
      >
        {children}
        {/* No close button here */}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ));
  CustomDialogContent.displayName = "CustomDialogContent";

  // If not open, don't render anything to prevent flickering
  if (!isOpen) {
    return null;
  }
  
  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open: boolean) => {
        if (!open) {
          // Start closing animation
          setIsClosing(true);
          
          // Wait for animation to complete before actually closing
          setTimeout(() => {
            onOpenChange(false);
            setIsClosing(false);
          }, 200); // Match this with the animation duration
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent 
        className={cn(
          "bg-[#222222] text-white border border-white/10 p-6",
          "sm:max-w-[1000px] max-h-[90vh] h-[90vh] overflow-hidden flex flex-col",
          "hide-close-button",
          isClosing && "dialog-closing"
        )}
      >
        <style jsx global>{`
          /* Target the close button in Radix UI Dialog with high specificity */
          [data-radix-popper-content-wrapper] [role="dialog"] button[type="button"][data-state] {
            display: none !important;
          }
          
          /* Target by exact class names used in shadcn/ui Dialog */
          .fixed.z-50.gap-4.bg-background.p-6.shadow-lg button[type="button"][class*="absolute"] {
            display: none !important;
          }
          
          /* Target by position - most Dialog close buttons are positioned absolutely in the top-right */
          .hide-close-button button[type="button"][class*="absolute"][class*="right"] {
            display: none !important;
          }
          
          /* Custom scrollbar styles */
          textarea::-webkit-scrollbar {
            width: 6px;
          }
          
          textarea::-webkit-scrollbar-track {
            background: transparent;
          }
          
          textarea::-webkit-scrollbar-thumb {
            background-color: #444444;
            border-radius: 3px;
          }
          
          textarea::-webkit-scrollbar-corner {
            background: transparent;
          }
          
          /* Firefox scrollbar */
          textarea {
            scrollbar-width: thin;
            scrollbar-color: #444444 transparent;
          }
          
          /* Animation styles */
          @keyframes scaleIn {
            0% {
              transform: translate(10px, 0) scale(0);
              opacity: 0;
            }
            40% {
              transform: translate(0, 0) scale(1.3);
            }
            70% {
              transform: scale(0.9);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
          
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.6;
            }
          }
          
          .animate-pulse {
            animation: pulse 1.5s ease-in-out infinite;
          }
          
          @keyframes tabExpand {
            0% {
              padding-right: 1rem;
            }
            100% {
              padding-right: 2rem;
            }
          }
          
          .animate-tab-expand {
            animation: tabExpand 0.3s ease-out forwards;
          }
          
          /* Dialog closing animation */
          @keyframes dialogClose {
            0% {
              opacity: 1;
              transform: scale(1);
            }
            100% {
              opacity: 0;
              transform: scale(0.95);
            }
          }
          
          .dialog-closing {
            animation: dialogClose 0.2s ease-out forwards;
          }
        `}</style>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="w-full flex-1 flex flex-col"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xl font-bold">Write Scripts for All Channels</h2>
                <p className="text-muted-foreground text-sm">Create content for each of your channels</p>
              </div>
              <TabsList className="bg-transparent flex space-x-3 p-2">
                {channels.slice(0, 5).map(channel => {
                  const hasContent = channelScripts.find(cs => cs.channelId === channel.id)?.hook.trim() !== "" && 
                                    channelScripts.find(cs => cs.channelId === channel.id)?.script.trim() !== "";
                  const currentIndex = channels.findIndex(c => c.id === channel.id);
                  const showAnimation = completedAnimations[channel.id];
                  const isGenerating = generatingSingleChannel === channel.id;
                  
                  return (
                    <TabsTrigger 
                      key={channel.id} 
                      value={channel.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md",
                        "data-[state=active]:bg-primary/20 data-[state=active]:text-primary relative",
                        "border border-white/10 hover:bg-[#2A2A2A]",
                        "mt-0.5",
                        "transition-all duration-300 ease-in-out",
                        hasContent ? "pr-8 pl-4 py-2" : "px-4 py-2",
                        hasContent && showAnimation && "animate-tab-expand"
                      )}
                    >
                      <div className={cn(
                        "w-7 h-7 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center flex-shrink-0",
                        isGenerating && "animate-pulse"
                      )}>
                        {channel.image_url ? (
                          <img 
                            src={channel.image_url} 
                            alt={channel.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-xs font-bold">
                            {(channel.nickname || channel.name).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="truncate max-w-[100px]">
                        {channel.nickname || channel.name}
                      </span>
                      {hasContent && (
                        <div 
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center",
                            showAnimation && "animate-scale-in"
                          )}
                        >
                          <Check className="w-3 h-3 text-black" />
                        </div>
                      )}
                    </TabsTrigger>
                  );
                })}
                
                {channels.length > 5 && (
                  <TabsTrigger 
                    value="more"
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-md",
                      "data-[state=active]:bg-primary/20 data-[state=active]:text-primary",
                      "border border-white/10 hover:bg-[#2A2A2A]",
                      "mt-0.5"
                    )}
                    onClick={() => {
                      const unselectedChannels = channels.filter(c => !channels.slice(0, 5).find(sc => sc.id === c.id));
                      if (unselectedChannels.length > 0) {
                        setActiveTab(unselectedChannels[0].id);
                      }
                    }}
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center">
                      <span className="text-white text-xs font-bold">+{channels.length - 5}</span>
                    </div>
                    <span>More</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
            
            {/* Model selection section */}
            <div className="flex gap-4 mb-4 p-2 border-b border-white/10 pb-4">
              <div className="flex-1">
                <Label className="text-white text-sm mb-1 block">Hook Generation Model</Label>
                <Select value={hookModel} onValueChange={setHookModel}>
                  <SelectTrigger className="bg-[#333333] border-[#3A3A3A] text-white">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#333333] border-[#3A3A3A] text-white">
                    {OPENROUTER_MODELS.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-white text-sm mb-1 block">Script Generation Model</Label>
                <Select value={scriptModel} onValueChange={setScriptModel}>
                  <SelectTrigger className="bg-[#333333] border-[#3A3A3A] text-white">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#333333] border-[#3A3A3A] text-white">
                    {OPENROUTER_MODELS.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex-1 py-1 px-1 overflow-y-auto">
              {channels.map(channel => {
                const channelScript = channelScripts.find(cs => cs.channelId === channel.id);
                if (!channelScript) return null;
                
                const currentIndex = channels.findIndex(c => c.id === channel.id);
                const isChannelGenerating = getGenerationTypeForChannel(channel.id) !== null;
                const generationType = getGenerationTypeForChannel(channel.id);
                const hasContent = channelScript.hook.trim() !== "" && channelScript.script.trim() !== "";
                const hasHook = channelScript.hook.trim() !== "";
                
                return (
                  <TabsContent key={channel.id} value={channel.id} className="mt-0 h-full">
                    <div className="border border-white/10 rounded-lg p-4 bg-[#2A2A2A] h-full flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center">
                            {channel.image_url ? (
                              <img 
                                src={channel.image_url} 
                                alt={channel.name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-white text-sm font-bold">
                                {(channel.nickname || channel.name).charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-white">
                              {channel.nickname 
                                ? `${channel.nickname} (${channel.name})` 
                                : channel.name}
                            </h3>
                            {channel.description && (
                              <p className="text-xs text-zinc-400 truncate max-w-[400px]">{channel.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleGenerateHook(channel.id)}
                            disabled={isAnyGenerationActive}
                            size="sm"
                            className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/20 gap-1"
                          >
                            {generatingHook === channel.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Generating Hook...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3" />
                                Generate Hook
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => handleGenerateScript(channel.id)}
                            disabled={isAnyGenerationActive || !hasHook}
                            size="sm"
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/20 gap-1"
                          >
                            {generatingSingleChannel === channel.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Generating Script...
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-3 h-3" />
                                Generate Script
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      {isChannelGenerating && (
                        <div className="mb-5">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-muted-foreground">
                              {generationStep === 'initializing' && 'Initializing...'}
                              {generationStep === 'generating_hook' && generationType === 'hook' && 'Generating hook...'}
                              {generationStep === 'generating_script' && generationType === 'script' && 'Generating script...'}
                              {generationStep === 'finalizing' && 'Finalizing content...'}
                            </span>
                            <span className="text-xs font-medium">{Math.round(generationProgress)}%</span>
                          </div>
                          <Progress value={generationProgress} className="h-1" />
                        </div>
                      )}
                      
                      <div className="flex-1 flex flex-col h-full space-y-3">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <Label className="text-white text-base font-medium">Title/Hook</Label>
                            <p className="text-xs text-muted-foreground">
                              {channelScript.hook.trim() ? channelScript.hook.trim().split(/\s+/).length : 0} words
                            </p>
                          </div>
                          <Input
                            placeholder="Enter an attention-grabbing hook..."
                            value={channelScript.hook}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleHookChange(channel.id, e.target.value)}
                            className="bg-[#333333] border-[#3A3A3A] text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent p-3 h-12 transition-colors"
                            style={{ fontSize: '16px' }}
                            disabled={isAnyGenerationActive}
                          />
                        </div>
                        
                        <div className="flex-1 flex flex-col min-h-0">
                          <div className="flex justify-between items-center mb-2">
                            <Label className="text-white text-base font-medium">Script</Label>
                            <p className="text-xs text-muted-foreground">
                              {channelScript.script.trim() ? channelScript.script.trim().split(/\s+/).length : 0} words
                            </p>
                          </div>
                          <Textarea
                            placeholder="Write your script here..."
                            value={channelScript.script}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleScriptChange(channel.id, e.target.value)}
                            className="flex-1 bg-[#333333] border-[#3A3A3A] text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent p-4 transition-colors h-full"
                            style={{ fontSize: '16px' }}
                            disabled={isAnyGenerationActive}
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                );
              })}
            </div>
          </Tabs>
        </div>
        
        <div className="flex justify-between items-center mt-2 pt-2">
          <Button
            onClick={handleBackToChannels}
            variant="ghost"
            className="text-muted-foreground hover:text-white hover:bg-[#333333] gap-2 px-3 py-1 h-9 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button
            onClick={handleGenerateAll}
            disabled={isAnyGenerationActive || generatingSingleChannel !== null || !isValid}
            className="bg-primary hover:bg-primary/90 text-white font-medium gap-2 px-4 py-1 h-9 text-sm"
          >
            {isAnyGenerationActive ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Generate Videos ({channelsWithContent}/{channels.length})
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 