import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Play, Loader2 } from "lucide-react";
import type { ChannelProfile } from "@/types/channel";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ContentInputModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChannelId: string | 'all' | null;
  channels: ChannelProfile[];
  hook: string;
  script: string;
  onHookChange: (hook: string) => void;
  onScriptChange: (script: string) => void;
  onBackToOptions: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function ContentInputModal({
  isOpen,
  onOpenChange,
  selectedChannelId,
  channels,
  hook,
  script,
  onHookChange,
  onScriptChange,
  onBackToOptions,
  onGenerate,
  isGenerating
}: ContentInputModalProps) {
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
          "sm:max-w-[1000px] max-h-[90vh]"
        )}
        autoFocus={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Write Your Script</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selectedChannelId === 'all' 
              ? 'Creating content for all channels' 
              : `Creating content for: ${channels.find(c => c.id === selectedChannelId)?.name || 'Selected channel'}`}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <Label className="text-white text-lg font-medium">Title/Hook</Label>
              <p className="text-xs text-muted-foreground">
                {hook.trim() ? hook.trim().split(/\s+/).length : 0} words
              </p>
            </div>
            <Input
              id="hook"
              placeholder="Enter an attention-grabbing hook..."
              value={hook}
              onChange={(e) => onHookChange(e.target.value)}
              className="bg-[#2A2A2A] border-[#3A3A3A] text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent p-4 h-14 transition-colors"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-muted-foreground mt-1">This will be the first thing viewers hear - make it catchy!</p>
          </div>
          
          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <Label className="text-white text-lg font-medium">Script</Label>
              <p className="text-xs text-muted-foreground">
                {script.trim() ? script.trim().split(/\s+/).length : 0} words
              </p>
            </div>
            <Textarea
              id="script"
              placeholder="Enter the main content of your video..."
              value={script}
              onChange={(e) => onScriptChange(e.target.value)}
              className="resize-none min-h-[400px] bg-[#2A2A2A] border-[#3A3A3A] text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent p-4 transition-colors"
              style={{ 
                fontSize: '16px',
                ...scrollbarStyles
              }}
            />
          </div>
        </div>
        
        <div className="flex gap-3 pt-4 mt-2">
          <Button 
            variant="outline"
            onClick={onBackToOptions}
            className="flex-1 text-white hover:bg-white/10 border-2 border-white/20 bg-[#2A2A2A]"
          >
            Back to Options
          </Button>
          <Button 
            onClick={onGenerate} 
            disabled={isGenerating} 
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
      </DialogContent>
    </Dialog>
  );
} 