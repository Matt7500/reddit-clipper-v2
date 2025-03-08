import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export interface GenerationStep {
  id: string;
  title: string;
  description: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface ProgressModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  steps: GenerationStep[];
}

export function ProgressModal({
  isOpen,
  onOpenChange,
  steps
}: ProgressModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#222222] text-white border border-white/10" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-bold">Generating Video</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Please wait while we process your content
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6">
          <div className="space-y-5">
            {steps.map((step) => (
              <div 
                key={step.id} 
                className={`
                  flex items-center space-x-4 p-4 rounded-lg transition-all duration-200
                  ${step.status === 'processing' ? 'bg-primary/5 border border-primary/20' : 'bg-[#2A2A2A] border border-[#3A3A3A]'}
                  ${step.status === 'completed' ? 'opacity-70' : 'opacity-100'}
                `}
              >
                <div className="flex-none">
                  <div className={`
                    w-5 h-5 rounded-full flex items-center justify-center
                    ${step.status === 'waiting' ? 'border-2 border-[#3A3A3A] bg-[#2A2A2A]' : ''}
                    ${step.status === 'processing' ? 'bg-primary animate-pulse' : ''}
                    ${step.status === 'completed' ? 'bg-green-500/90' : ''}
                    ${step.status === 'error' ? 'bg-red-500/90' : ''}
                  `}>
                    {step.status === 'processing' && (
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    )}
                    {step.status === 'completed' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {step.status === 'error' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 items-center min-w-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{step.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{step.description}</div>
                    {step.status === 'error' && step.error && (
                      <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-400 break-words">{step.error}</p>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex-none">
                    {step.status === 'completed' && (
                      <span className="text-xs text-green-400 font-medium whitespace-nowrap">Completed</span>
                    )}
                    {step.status === 'processing' && (
                      <span className="text-xs text-primary font-medium whitespace-nowrap animate-pulse">Processing...</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 