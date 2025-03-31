import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export interface GenerationStep {
  id: string;
  title: string;
  description: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  error?: string;
  progress?: number;
}

interface ProgressModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  steps: GenerationStep[];
  isMultiChannel?: boolean;
  currentChannelName?: string;
  currentChannelImage?: string | null;
  completedCount?: number;
  totalCount?: number;
}

export function ProgressModal({
  isOpen,
  onOpenChange,
  steps,
  isMultiChannel = false,
  currentChannelName = '',
  currentChannelImage = null,
  completedCount = 0,
  totalCount = 0
}: ProgressModalProps) {
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  // Check if there's an error in any step
  const hasError = steps.some(step => step.status === 'error');
  
  // Custom onOpenChange handler to only allow closing when there's an error
  const handleOpenChange = (open: boolean) => {
    // If trying to close (open === false) and there's no error, prevent closing
    if (!open && !hasError) {
      console.log('Preventing progress modal close - generation in progress');
      return;
    }
    
    // Otherwise, allow the change
    onOpenChange(open);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#222222] text-white border border-white/10" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-bold">
            {isMultiChannel ? "Generating Videos" : "Generating Video"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isMultiChannel 
              ? `Processing videos for all channels (${completedCount}/${totalCount})`
              : "Please wait while we process your content"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6">
          {isMultiChannel && (
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Progress</span>
                <span className="text-white font-medium">{completedCount} of {totalCount}</span>
              </div>
              <div className="w-full h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-in-out"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          )}
          
          {isMultiChannel && currentChannelName && (
            <div className="mb-6 p-3 bg-[#2A2A2A] rounded-lg border border-[#3A3A3A]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center">
                  {currentChannelImage ? (
                    <img 
                      src={currentChannelImage} 
                      alt={currentChannelName} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-sm font-bold">
                      {currentChannelName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">Currently Processing</h3>
                  <p className="text-xs text-muted-foreground">{currentChannelName}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-5">
            {steps.map((step) => (
              <div 
                key={step.id} 
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg transition-all duration-200",
                  step.status === 'processing' ? 'bg-primary/5 border border-primary/20' : 'bg-[#2A2A2A] border border-[#3A3A3A]',
                  step.status === 'completed' ? 'opacity-70' : 'opacity-100'
                )}
              >
                <div className="flex-none">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center",
                    step.status === 'waiting' ? 'border-2 border-[#3A3A3A] bg-[#2A2A2A]' : '',
                    step.status === 'processing' ? 'bg-primary animate-pulse' : '',
                    step.status === 'completed' ? 'bg-green-500/90' : '',
                    step.status === 'error' ? 'bg-red-500/90' : ''
                  )}>
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
                    {step.status === 'processing' && typeof step.progress === 'number' && (
                      <div className="mt-2">
                        <Progress value={step.progress} className="h-1 bg-[#3A3A3A]" indicatorClassName="bg-primary" />
                        <p className="text-xs text-primary text-right mt-1">{step.progress}%</p>
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