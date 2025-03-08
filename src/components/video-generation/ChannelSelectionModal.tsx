import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, ArrowRight, Check, Users } from "lucide-react";
import type { ChannelProfile } from "@/types/channel";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface ChannelSelectionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChannelId: string | 'all' | null;
  onChannelSelect: (channelId: string | 'all') => void;
  onContinue: () => void;
  channels: ChannelProfile[];
  isLoadingChannels: boolean;
  onCreateChannel: () => void;
}

export function ChannelSelectionModal({
  isOpen,
  onOpenChange,
  selectedChannelId,
  onChannelSelect,
  onContinue,
  channels,
  isLoadingChannels,
  onCreateChannel
}: ChannelSelectionModalProps) {
  const navigate = useNavigate();
  const [localSelectedId, setLocalSelectedId] = useState<string | 'all' | null>(selectedChannelId);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  // Update local state when prop changes
  useEffect(() => {
    setLocalSelectedId(selectedChannelId);
  }, [selectedChannelId]);

  // Preload images when channels are available
  useEffect(() => {
    if (channels.length > 0) {
      const imageCache: Record<string, boolean> = {};
      
      channels.forEach(channel => {
        if (channel.image_url) {
          const img = new Image();
          img.src = channel.image_url;
          img.onload = () => {
            setLoadedImages(prev => ({
              ...prev,
              [channel.id]: true
            }));
          };
          img.onerror = () => {
            setLoadedImages(prev => ({
              ...prev,
              [channel.id]: false
            }));
          };
          imageCache[channel.id] = false;
        }
      });
      
      setLoadedImages(imageCache);
    }
  }, [channels]);

  const handleChannelSelect = (channelId: string | 'all') => {
    setLocalSelectedId(channelId);
    onChannelSelect(channelId);
  };

  const handleCreateChannel = () => {
    onCreateChannel();
    onOpenChange(false); // Close the channel selection modal
  };

  // Function to render channel avatar
  const renderChannelAvatar = (channel: ChannelProfile) => {
    if (!channel.image_url) {
      return (
        <span className="text-white text-sm font-bold">
          {channel.name.charAt(0).toUpperCase()}
        </span>
      );
    }

    const isImageLoaded = loadedImages[channel.id];
    
    return (
      <>
        {/* Placeholder while loading */}
        {!isImageLoaded && (
          <span className="text-white text-sm font-bold absolute inset-0 flex items-center justify-center">
            {channel.name.charAt(0).toUpperCase()}
          </span>
        )}
        
        {/* Actual image */}
        <img 
          src={channel.image_url} 
          alt={channel.name}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            isImageLoaded ? "opacity-100" : "opacity-0"
          )}
          loading="eager"
          onError={() => {
            setLoadedImages(prev => ({
              ...prev,
              [channel.id]: false
            }));
          }}
        />
      </>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] bg-[#222222] text-white border border-white/10 p-6" autoFocus={false}>
        <DialogHeader className="mb-4">
          <DialogTitle className="text-2xl font-bold text-center">Select Channel</DialogTitle>
          <DialogDescription className="text-center text-zinc-400 mt-2">
            Choose which channel to generate a video for
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {isLoadingChannels ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div 
                onClick={() => handleChannelSelect('all')}
                className={cn(
                  "relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200",
                  "border-2 hover:border-primary/70",
                  localSelectedId === 'all' 
                    ? "border-primary bg-primary/10" 
                    : "border-white/10 bg-[#2A2A2A] hover:bg-[#333333]"
                )}
              >
                <div className="p-4 flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    "bg-gradient-to-br from-primary/20 to-primary/10",
                    localSelectedId === 'all' ? "text-primary" : "text-zinc-400"
                  )}>
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className={cn(
                      "text-lg font-semibold",
                      localSelectedId === 'all' ? "text-primary" : "text-white"
                    )}>
                      All Channels
                    </h3>
                    <p className="text-sm text-zinc-400">
                      Generate content for all your channels
                    </p>
                  </div>
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                    localSelectedId === 'all' 
                      ? "border-primary text-primary bg-primary/10" 
                      : "border-zinc-500 text-transparent"
                  )}>
                    {localSelectedId === 'all' && <Check className="w-4 h-4" />}
                  </div>
                </div>
              </div>
              
              {channels.map(channel => (
                <div 
                  key={channel.id} 
                  onClick={() => handleChannelSelect(channel.id)}
                  className={cn(
                    "relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200",
                    "border-2 hover:border-primary/70",
                    localSelectedId === channel.id 
                      ? "border-primary bg-primary/10" 
                      : "border-white/10 bg-[#2A2A2A] hover:bg-[#333333]"
                  )}
                >
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-[#1A1A1A] flex items-center justify-center relative">
                      {renderChannelAvatar(channel)}
                    </div>
                    <div className="flex-1">
                      <h3 className={cn(
                        "text-lg font-semibold",
                        localSelectedId === channel.id ? "text-primary" : "text-white"
                      )}>
                        {channel.name}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {channel.description || `Generate content for ${channel.name}`}
                      </p>
                    </div>
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                      localSelectedId === channel.id 
                        ? "border-primary text-primary bg-primary/10" 
                        : "border-zinc-500 text-transparent"
                    )}>
                      {localSelectedId === channel.id && <Check className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
            <Button 
              variant="ghost"
              onClick={handleCreateChannel}
              className="text-zinc-400 hover:text-white hover:bg-transparent px-2"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add New Channel
            </Button>
            
            <Button 
              onClick={onContinue}
              disabled={!localSelectedId}
              className={cn(
                "w-full sm:w-auto bg-primary hover:bg-primary/90 text-white font-medium transition-all px-8",
                !localSelectedId ? "opacity-50" : "opacity-100"
              )}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 