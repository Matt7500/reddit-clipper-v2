import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Copy, Check, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoData {
  channelId: string;
  channelName: string;
  channelNickname?: string;
  channelImageUrl?: string;
  title: string;
  videoUrl: string;
}

interface MultiChannelCompletedDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  videos: VideoData[];
  apiUrl: string;
}

export function MultiChannelCompletedDialog({
  isOpen,
  onOpenChange,
  videos,
  apiUrl
}: MultiChannelCompletedDialogProps) {
  const { toast } = useToast();
  const [copiedTitles, setCopiedTitles] = useState<Record<string, boolean>>({});
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);

  const handleCopyTitle = async (video: VideoData) => {
    if (!video.title) return;
    
    try {
      await navigator.clipboard.writeText(`${video.title} 🤔 #shorts`);
      setCopiedTitles(prev => ({ ...prev, [video.channelId]: true }));
      setTimeout(() => {
        setCopiedTitles(prev => ({ ...prev, [video.channelId]: false }));
      }, 2000);
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

  const handleDownload = async (video: VideoData) => {
    try {
      // Get the video URL, either from Supabase or local server
      const videoUrl = video.videoUrl && !video.videoUrl.startsWith('http') 
        ? `${apiUrl}${video.videoUrl}` 
        : video.videoUrl;
      
      // Fetch the video file
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      
      // Create a blob URL
      const url = window.URL.createObjectURL(blob);
      
      // Format the filename with channel name
      const channelNameFormatted = (video.channelNickname || video.channelName || '').trim().replace(/\s+/g, '-');
      const formattedTitle = video.title.trim().replace(/\s+/g, '-');
      const filename = channelNameFormatted 
        ? `${channelNameFormatted}_${formattedTitle}.mp4` 
        : `${formattedTitle}.mp4`;
      
      // Create and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Download started",
        description: `Downloading video for ${video.channelName}`,
        duration: 2000,
      });
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

  const handleSelectVideo = (video: VideoData) => {
    setSelectedVideo(video);
  };

  const handleClosePreview = () => {
    setSelectedVideo(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "sm:max-w-[900px] max-h-[90vh] overflow-y-auto",
          "bg-zinc-900 text-white border-zinc-700 p-6"
        )}
      >
        <DialogHeader className="space-y-1.5">
          <div className="text-center">
            <DialogTitle className="text-xl font-semibold">Videos Generated Successfully</DialogTitle>
            <DialogDescription className="text-zinc-400 mt-1.5">
              {videos.length} videos have been generated for your channels
            </DialogDescription>
          </div>
        </DialogHeader>
        
        {selectedVideo ? (
          <div className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center">
                  {selectedVideo.channelImageUrl ? (
                    <img 
                      src={selectedVideo.channelImageUrl} 
                      alt={selectedVideo.channelName} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-sm font-bold">
                      {(selectedVideo.channelNickname || selectedVideo.channelName).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {selectedVideo.channelNickname 
                    ? `${selectedVideo.channelNickname} (${selectedVideo.channelName})` 
                    : selectedVideo.channelName}
                </h3>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleClosePreview}
                className="text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="relative max-h-[60vh] aspect-[9/16] mx-auto bg-black rounded-lg overflow-hidden">
              <video
                src={selectedVideo.videoUrl && !selectedVideo.videoUrl.startsWith('http') 
                  ? `${apiUrl}${selectedVideo.videoUrl}` 
                  : selectedVideo.videoUrl}
                className="w-full h-full object-contain"
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                preload="auto"
              />
            </div>
            
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => handleCopyTitle(selectedVideo)}
                className="flex-1 bg-[#2A2A2A] text-white hover:bg-white/10 border-2 border-white/20 gap-2"
              >
                {copiedTitles[selectedVideo.channelId] ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                Copy Title
              </Button>
              <Button
                onClick={() => handleDownload(selectedVideo)}
                className="flex-1 bg-primary hover:bg-primary/90 gap-2"
              >
                <Download className="w-4 h-4" />
                Download Video
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {videos.map((video) => (
              <div 
                key={video.channelId}
                className="border border-white/10 rounded-lg p-4 bg-[#2A2A2A] hover:bg-[#333333] transition-colors cursor-pointer"
                onClick={() => handleSelectVideo(video)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center">
                    {video.channelImageUrl ? (
                      <img 
                        src={video.channelImageUrl} 
                        alt={video.channelName} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-sm font-bold">
                        {(video.channelNickname || video.channelName).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {video.channelNickname 
                      ? `${video.channelNickname} (${video.channelName})` 
                      : video.channelName}
                  </h3>
                </div>
                
                <div className="aspect-video bg-black rounded-md overflow-hidden mb-3">
                  <video
                    src={video.videoUrl && !video.videoUrl.startsWith('http') 
                      ? `${apiUrl}${video.videoUrl}` 
                      : video.videoUrl}
                    className="w-full h-full object-cover"
                    preload="metadata"
                  />
                </div>
                
                <p className="text-sm text-white mb-3 line-clamp-2">{video.title}</p>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyTitle(video);
                    }}
                    className="flex-1 bg-[#1A1A1A] text-white hover:bg-white/10 border border-white/20 gap-1"
                  >
                    {copiedTitles[video.channelId] ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(video);
                    }}
                    className="flex-1 bg-primary hover:bg-primary/90 gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
} 