import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrainCircuit, Bot, Mic2, Key, Check } from "lucide-react";
import type { VoiceModel, APIKeyErrors, EditingKeys } from "./types";

interface APISettingsProps {
  openrouterModel: string;
  openrouterApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceModel: string;
  openaiApiKey: string;
  voiceModels: VoiceModel[];
  loadingModels: boolean;
  apiKeyErrors: APIKeyErrors;
  editingKeys: EditingKeys;
  isSaving: boolean;
  onOpenAIKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenRouterKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onElevenLabsKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenRouterModelChange: (value: string) => void;
  onElevenLabsVoiceModelChange: (value: string) => void;
  onSaveSettings: () => Promise<void>;
}

export const APISettings = ({
  openrouterModel,
  openrouterApiKey,
  elevenlabsApiKey,
  elevenlabsVoiceModel,
  openaiApiKey,
  voiceModels,
  loadingModels,
  apiKeyErrors,
  editingKeys,
  isSaving,
  onOpenAIKeyChange,
  onOpenRouterKeyChange,
  onElevenLabsKeyChange,
  onOpenRouterModelChange,
  onElevenLabsVoiceModelChange,
  onSaveSettings,
}: APISettingsProps) => {
  const getInputClassName = (error: string, hasValue: boolean) => {
    if (error) return "bg-[#222222] border-red-500";
    return "bg-[#222222] border-[#3A3A3A]";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-medium text-white flex items-center gap-2 text-xl">
          <Key className="w-5 h-5 text-primary" />
          API Settings
        </h1>
      </div>
      <div className="space-y-6">
        {/* OpenAI Section */}
        <div className="space-y-4 p-4 rounded-lg bg-[#2A2A2A] border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className="w-5 h-5 text-green-400" />
            <h4 className="font-medium text-white">OpenAI Configuration</h4>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">API Key</label>
            <div className="relative">
              <Input 
                type="password"
                value={openaiApiKey}
                onChange={onOpenAIKeyChange}
                className={getInputClassName(apiKeyErrors.openai, !!openaiApiKey)}
                placeholder="sk-proj-..."
              />
              {openaiApiKey && !apiKeyErrors.openai && editingKeys.openai && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>
            {apiKeyErrors.openai && (
              <p className="text-xs text-red-500">{apiKeyErrors.openai}</p>
            )}
            <p className="text-xs text-muted-foreground">Used for subtitle word coloring</p>
          </div>
        </div>

        {/* OpenRouter Section */}
        <div className="space-y-4 p-4 rounded-lg bg-[#2A2A2A] border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <h4 className="font-medium text-white">OpenRouter Configuration</h4>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">API Key</label>
            <div className="relative">
              <Input 
                type="password"
                value={openrouterApiKey}
                onChange={onOpenRouterKeyChange}
                className={getInputClassName(apiKeyErrors.openrouter, !!openrouterApiKey)}
                placeholder="sk-or-v1-..."
              />
              {openrouterApiKey && !apiKeyErrors.openrouter && editingKeys.openrouter && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>
            {apiKeyErrors.openrouter && (
              <p className="text-xs text-red-500">{apiKeyErrors.openrouter}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Model</label>
            <Input 
              type="text"
              value={openrouterModel}
              onChange={(e) => onOpenRouterModelChange(e.target.value)}
              className="bg-[#222222] border-[#3A3A3A]"
              placeholder="anthropic/claude-3-opus-20240229"
            />
            <p className="text-xs text-muted-foreground">The model to use for script generation</p>
          </div>
        </div>

        {/* ElevenLabs Section */}
        <div className="space-y-4 p-4 rounded-lg bg-[#2A2A2A] border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Mic2 className="w-5 h-5 text-purple-400" />
            <h4 className="font-medium text-white">ElevenLabs Configuration</h4>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">API Key</label>
            <div className="relative">
              <Input 
                type="password"
                value={elevenlabsApiKey}
                onChange={onElevenLabsKeyChange}
                className={getInputClassName(apiKeyErrors.elevenlabs, !!elevenlabsApiKey)}
                placeholder="your-elevenlabs-api-key"
              />
              {elevenlabsApiKey && !apiKeyErrors.elevenlabs && editingKeys.elevenlabs && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>
            {apiKeyErrors.elevenlabs && (
              <p className="text-xs text-red-500">{apiKeyErrors.elevenlabs}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Voice Model</label>
            <Select 
              value={elevenlabsVoiceModel} 
              onValueChange={onElevenLabsVoiceModelChange}
              disabled={loadingModels || !elevenlabsApiKey}
            >
              <SelectTrigger className="bg-[#222222] border-[#3A3A3A]">
                <SelectValue placeholder={loadingModels ? "Loading models..." : "Select a voice model"}>
                  {elevenlabsVoiceModel && voiceModels.find(model => model.model_id === elevenlabsVoiceModel)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                {voiceModels.map((model) => (
                  <SelectItem 
                    key={model.model_id} 
                    value={model.model_id}
                    className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{model.name}</span>
                      {model.description && (
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingModels && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 h-3 border-2 border-purple-400/20 border-t-purple-400 rounded-full animate-spin" />
                Loading available models...
              </div>
            )}
            <p className="text-xs text-muted-foreground">The model to use for voice generation</p>
          </div>
        </div>

        <Button 
          onClick={onSaveSettings}
          disabled={isSaving || Object.values(apiKeyErrors).some(error => error !== "")}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Save API Settings
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}; 