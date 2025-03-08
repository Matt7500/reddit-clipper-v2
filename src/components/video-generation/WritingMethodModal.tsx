import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Brain, Pencil, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface WritingMethodModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAI: () => void;
  onSelectManual: () => void;
}

export function WritingMethodModal({
  isOpen,
  onOpenChange,
  onSelectAI,
  onSelectManual,
}: WritingMethodModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'ai' | 'manual' | null>(null);

  const handleContinue = () => {
    if (selectedMethod === 'ai') {
      onSelectAI();
    } else if (selectedMethod === 'manual') {
      onSelectManual();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] bg-[#222222] text-white border border-white/10 p-6" autoFocus={false}>
        <DialogHeader className="mb-4">
          <DialogTitle className="text-2xl font-bold text-center">Choose Writing Method</DialogTitle>
          <DialogDescription className="text-center text-zinc-400 mt-2">
            Select how you want to create your video content
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div
            onClick={() => setSelectedMethod('ai')}
            className={cn(
              "relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200",
              "border-2 hover:border-primary/70",
              selectedMethod === 'ai' 
                ? "border-primary bg-primary/10" 
                : "border-white/10 bg-[#2A2A2A] hover:bg-[#333333]"
            )}
          >
            {selectedMethod === 'ai' && (
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              </div>
            )}
            <div className="p-6 flex flex-col items-center text-center">
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center mb-4",
                "bg-gradient-to-br from-primary/20 to-primary/10",
                selectedMethod === 'ai' ? "text-primary" : "text-zinc-400"
              )}>
                <Brain className="w-7 h-7" />
              </div>
              <h3 className={cn(
                "text-lg font-semibold mb-2",
                selectedMethod === 'ai' ? "text-primary" : "text-white"
              )}>
                AI Writing
              </h3>
              <p className="text-sm text-zinc-400 mb-3">
                Let AI generate hook and script for you based on trending topics
              </p>
              <div className={cn(
                "text-xs px-3 py-1 rounded-full",
                selectedMethod === 'ai' 
                  ? "bg-primary/20 text-primary" 
                  : "bg-white/10 text-zinc-400"
              )}>
                Recommended
              </div>
            </div>
          </div>

          <div
            onClick={() => setSelectedMethod('manual')}
            className={cn(
              "relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200",
              "border-2 hover:border-primary/70",
              selectedMethod === 'manual' 
                ? "border-primary bg-primary/10" 
                : "border-white/10 bg-[#2A2A2A] hover:bg-[#333333]"
            )}
          >
            {selectedMethod === 'manual' && (
              <div className="absolute top-3 right-3">
                <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              </div>
            )}
            <div className="p-6 flex flex-col items-center text-center">
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center mb-4",
                "bg-gradient-to-br from-primary/20 to-primary/10",
                selectedMethod === 'manual' ? "text-primary" : "text-zinc-400"
              )}>
                <Pencil className="w-7 h-7" />
              </div>
              <h3 className={cn(
                "text-lg font-semibold mb-2",
                selectedMethod === 'manual' ? "text-primary" : "text-white"
              )}>
                Manual Writing
              </h3>
              <p className="text-sm text-zinc-400 mb-3">
                Write your own hook and script with complete creative control
              </p>
              <div className={cn(
                "text-xs px-3 py-1 rounded-full",
                selectedMethod === 'manual' 
                  ? "bg-primary/20 text-primary" 
                  : "bg-white/10 text-zinc-400"
              )}>
                Advanced
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            onClick={handleContinue}
            disabled={!selectedMethod}
            className={cn(
              "w-full bg-primary hover:bg-primary/90 text-white font-medium transition-all",
              !selectedMethod ? "opacity-50" : "opacity-100"
            )}
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 