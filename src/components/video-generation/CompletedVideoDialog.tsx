import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { useToast } from "../../components/ui/use-toast";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CompletedVideoDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  videoData: {
    videoMetadata?: {
      video_url: string;
      title: string;
    };
    hookVideo?: string;
    title?: string;
    channelName?: string;
    channelNickname?: string;
  } | null;
  apiUrl: string;
}

export function CompletedVideoDialog({
  isOpen,
  onOpenChange,
  videoData,
  apiUrl
}: CompletedVideoDialogProps) {
  const { toast } = useToast();
  const [titleCopied, setTitleCopied] = useState(false);

  const handleCopyTitle = async () => {
    const title = videoData?.videoMetadata?.title || videoData?.title;
    if (!title) return;
    
    try {
      await navigator.clipboard.writeText(`${title} 🤔 #shorts`);
      setTitleCopied(true);
      setTimeout(() => setTitleCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Title has been copied to your clipboard.",
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

  const handleDownload = async () => {
    if (!videoData) return;

    try {
      // Get the video URL, either from Supabase or local server
      const videoUrl = videoData.videoMetadata?.video_url || (videoData.hookVideo && !videoData.hookVideo.startsWith('http') ? `${apiUrl}${videoData.hookVideo}` : videoData.hookVideo);
      
      // Fetch the video file
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      
      // Create a blob URL
      const url = window.URL.createObjectURL(blob);
      
      // Create filename from title or use default
      const title = videoData.videoMetadata?.title || videoData.title;
      const channelName = videoData.channelNickname || videoData.channelName || '';
      const channelNameFormatted = channelName.trim().replace(/\s+/g, '-');
      
      // Format the filename with channel name if available
      let filename = 'generated-video.mp4';
      if (title) {
        const formattedTitle = title.trim().replace(/\s+/g, '-');
        filename = channelNameFormatted 
          ? `${channelNameFormatted}_${formattedTitle}.mp4` 
          : `${formattedTitle}.mp4`;
      }
      
      // Create and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading video:', error);
      toast({
        title: "Download failed",
        description: "Failed to download the video. Please try again.",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  // Get the video URL, either from Supabase or local server
  const videoUrl = videoData?.videoMetadata?.video_url || (videoData?.hookVideo && !videoData.hookVideo.startsWith('http') ? `${apiUrl}${videoData.hookVideo}` : videoData?.hookVideo);

  // Format channel display name
  const channelDisplayName = videoData?.channelNickname && videoData?.channelName
    ? `${videoData.channelNickname} (${videoData.channelName})`
    : videoData?.channelName || '';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-zinc-900 text-white border-zinc-700">
        <DialogHeader className="space-y-1.5">
          <div className="text-center">
            <DialogTitle className="text-xl font-semibold">Video Generated Successfully</DialogTitle>
            <DialogDescription className="text-zinc-400 mt-1.5">
              Your video has been generated and is ready to be downloaded
            </DialogDescription>
          </div>
        </DialogHeader>
        
        <div className="py-4">
          {videoData && videoUrl && (
            <div className="space-y-4">
              <div className="relative max-h-[60vh] aspect-[9/16] mx-auto bg-black rounded-lg overflow-hidden">
                <video
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  preload="auto"
                />
              </div>
              
              {channelDisplayName && (
                <div className="text-center">
                  <span className="text-zinc-400">Channel: </span>
                  <span className="font-medium">{channelDisplayName}</span>
                </div>
              )}
              
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={handleCopyTitle}
                  disabled={!videoData.title && !videoData.videoMetadata?.title}
                  className="flex-1 bg-[#2A2A2A] text-white hover:bg-white/10 border-2 border-white/20 gap-2"
                >
                  {titleCopied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  Copy Title
                </Button>
                <Button
                  onClick={handleDownload}
                  className="flex-1 bg-primary hover:bg-primary/90 gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download Video
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 