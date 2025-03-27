import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PromptSettingsProps {
  hookSystemPrompt: string;
  scriptSystemPrompt: string;
  isSaving: boolean;
  onPromptChange: (hookPrompt: string, scriptPrompt: string) => void;
  onResetPrompts: () => void;
}

export const PromptSettings = ({
  hookSystemPrompt,
  scriptSystemPrompt,
  isSaving,
  onPromptChange,
  onResetPrompts,
}: PromptSettingsProps) => {
  const [localHookPrompt, setLocalHookPrompt] = useState(hookSystemPrompt);
  const [localScriptPrompt, setLocalScriptPrompt] = useState(scriptSystemPrompt);
  const [activeTab, setActiveTab] = useState("hook");

  const handleSavePrompts = () => {
    onPromptChange(localHookPrompt, localScriptPrompt);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-medium text-white flex items-center gap-2 text-xl">
          <FileText className="w-5 h-5 text-primary" />
          System Prompts
        </h1>
      </div>

      <div className="space-y-6">
        <div className="space-y-4 p-4 rounded-lg bg-[#2A2A2A] border border-white/10">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-[#222222] h-[40px]">
              <TabsTrigger 
                value="hook" 
                className="data-[state=active]:bg-primary px-4"
              >
                Hook Generation
              </TabsTrigger>
              <TabsTrigger 
                value="script" 
                className="data-[state=active]:bg-primary px-4"
              >
                Script Generation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="hook" className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-muted-foreground">Hook Generation System Prompt</label>
                  <span className="text-xs text-muted-foreground">
                    {localHookPrompt.length} characters
                  </span>
                </div>
                <Textarea
                  value={localHookPrompt}
                  onChange={(e) => setLocalHookPrompt(e.target.value)}
                  className="min-h-[400px] bg-[#222222] border-[#3A3A3A] text-white font-mono text-sm textarea-minimal-scrollbar"
                  placeholder="Enter system prompt for hook generation..."
                />
                <p className="text-xs text-muted-foreground">
                  This prompt is used when generating hook questions for your content.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="script" className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-muted-foreground">Script Generation System Prompt</label>
                  <span className="text-xs text-muted-foreground">
                    {localScriptPrompt.length} characters
                  </span>
                </div>
                <Textarea
                  value={localScriptPrompt}
                  onChange={(e) => setLocalScriptPrompt(e.target.value)}
                  className="min-h-[400px] bg-[#222222] border-[#3A3A3A] text-white font-mono text-sm textarea-minimal-scrollbar"
                  placeholder="Enter system prompt for script generation..."
                />
                <p className="text-xs text-muted-foreground">
                  This prompt is used when generating scripts for your content.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex space-x-2">
          <Button
            onClick={handleSavePrompts}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary/90"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                Save Prompts
              </span>
            )}
          </Button>
          <Button
            onClick={onResetPrompts}
            variant="outline"
            className="border-[#3A3A3A] hover:bg-[#2A2A2A]"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
}; 