import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { VideoGallery } from "@/components/VideoGallery";
import { Play, Settings as SettingsIcon, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChannels } from "@/hooks/useChannels";
import { useVideoGeneration } from "@/hooks/useVideoGeneration";
import { ProgressModal } from "@/components/video-generation/ProgressModal";
import { MultiChannelScriptModal } from "@/components/video-generation/MultiChannelScriptModal";
import { MultiChannelCompletedDialog } from "@/components/video-generation/MultiChannelCompletedDialog";
import { CreateProfileDialog } from "@/components/settings/CreateProfileDialog";
import { useChannelProfiles } from "@/contexts/ChannelProfileContext";
import { supabase } from "@/integrations/supabase/client";
import type { ChannelProfile } from "@/types/channel";
import type { StyleOption } from "@/components/settings/types";
import { defaultFonts } from "@/components/settings/types";

const API_URL = import.meta.env.VITE_API_URL;

const Index = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Only keep the MultiChannelScriptModal state
  const [isMultiChannelScriptModalOpen, setIsMultiChannelScriptModalOpen] = useState(false);
  // State for triggering VideoGallery refresh
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  
  // State for CreateProfileDialog
  const [isCreateProfileDialogOpen, setIsCreateProfileDialogOpen] = useState(false);
  const [channelImage, setChannelImage] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { channels, isLoadingChannels, refreshChannels } = useChannels();
  const { createProfile } = useChannelProfiles();
  const {
    isGenerating: isVideoGenerating,
    generationSteps,
    generateVideo,
    isProgressModalOpen,
    setIsProgressModalOpen,
    // Multi-channel properties
    generateMultiChannelVideos,
    isMultiChannelMode,
    completedMultiChannelVideos,
    isMultiChannelCompletedDialogOpen,
    setIsMultiChannelCompletedDialogOpen,
    currentChannelIndex,
    totalChannels,
    currentChannelName,
    currentChannelImage
  } = useVideoGeneration();

  // Effect to trigger gallery refresh when completion dialog opens
  useEffect(() => {
    if (isMultiChannelCompletedDialogOpen) {
      console.log("Index: Completion dialog opened, triggering gallery refresh.");
      setGalleryRefreshKey(prev => prev + 1);
    }
  }, [isMultiChannelCompletedDialogOpen]);

  // Function to handle image upload for new channel
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `${user?.id}/${fileName}`;
    
    try {
      const { error: uploadError, data } = await supabase.storage
        .from('channel-images')
        .upload(filePath, file);
        
      if (uploadError) {
        throw uploadError;
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('channel-images')
        .getPublicUrl(filePath);
        
      setChannelImage(publicUrl);
    } catch (error: any) {
      toast({
        title: "Error uploading image",
        description: error.message || "Please try again",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  // Function to handle creating a new channel profile
  const handleCreateProfile = async (data: {
    name: string;
    image_url: string | null;
    font: string;
    voice_id?: string;
    style: StyleOption;
    has_background_music: boolean;
    background_video_type: 'gameplay' | 'satisfying';
    audio_speed: number;
    subtitle_size: number;
    stroke_size: number;
  }) => {
    try {
      await createProfile(data);
      toast({
        title: "Channel created",
        description: "Your new channel has been created successfully",
        duration: 2000,
      });
      setIsCreateProfileDialogOpen(false);
      setChannelImage(null);
      
      // Refresh the channels list
      await refreshChannels();
    } catch (error: any) {
      toast({
        title: "Error creating channel",
        description: error.message || "Please try again",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/signin');
    } catch (error) {
      toast({
        title: "Error signing out",
        description: "Please try again",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  // Simplified function to directly open the MultiChannelScriptModal
  const handleStartGeneration = () => {
    if (channels.length === 0) {
      toast({
        title: "No channels found",
        description: "You need to create a channel first. Redirecting to settings...",
        duration: 2000,
      });
      setTimeout(() => navigate('/settings'), 1500);
    } else {
      // Directly open the MultiChannelScriptModal
      setIsMultiChannelScriptModalOpen(true);
    }
  };

  // Handler for multi-channel script generation
  const handleGenerateMultiChannel = async (channelScripts: any[]) => {
    setIsMultiChannelScriptModalOpen(false);
    setIsProgressModalOpen(true);
    
    // Filter out any channels with empty scripts
    const validScripts = channelScripts.filter(cs => 
      cs.hook.trim() !== "" && cs.script.trim() !== ""
    );
    
    if (validScripts.length === 0) {
      toast({
        title: "No valid content",
        description: "Please provide at least one channel with both hook and script",
        variant: "destructive",
        duration: 2000,
      });
      setIsProgressModalOpen(false);
      return;
    }
    
    await generateMultiChannelVideos(validScripts, channels);
  };

  return (
    <div className="min-h-screen bg-[#222222]">
      <div className="flex flex-col p-6 md:p-8 max-w-7xl mx-auto relative">
        <div className="absolute top-6 md:top-8 left-6 md:left-8">
          <div className="text-white text-2xl md:text-3xl font-semibold">
            Welcome, <span className="text-primary">{user?.user_metadata?.name || user?.email}</span>
          </div>
        </div>

        <div className="absolute top-6 md:top-8 right-6 md:right-8 flex items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/settings')}
            className="text-white gap-2 text-lg bg-[#F1F1F1]/10 hover:bg-primary backdrop-blur-lg"
          >
            <SettingsIcon className="w-6 h-6" />
            Settings
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={handleSignOut}
            className="text-white gap-2 text-lg bg-zinc-800 border-2 border-white/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 backdrop-blur-lg transition-colors"
          >
            <LogOut className="w-6 h-6" />
            Sign Out
          </Button>
        </div>

        <div className="flex-none text-center mb-6 mt-20">
          <h1 className="text-4xl font-bold text-white mb-2">Reddit Shorts Generator</h1>
          <p className="text-muted-foreground mb-4">Create viral shorts from Reddit content in seconds</p>
        </div>

        <div className="flex justify-center mb-6">
          <Button
            size="lg"
            onClick={handleStartGeneration}
            disabled={isGenerating}
            className="bg-primary hover:bg-primary/90 text-white font-medium"
          >
            <Play className="w-5 h-5 mr-2" />
            {isGenerating ? "Processing..." : "Generate Video"}
          </Button>
        </div>

        <div className="w-full">
          <VideoGallery refreshTrigger={galleryRefreshKey} />
        </div>
      </div>

      {/* Multi-channel script modal - now the primary content creation interface */}
      <MultiChannelScriptModal
        isOpen={isMultiChannelScriptModalOpen}
        onOpenChange={setIsMultiChannelScriptModalOpen}
        channels={channels}
        onGenerate={handleGenerateMultiChannel}
        isGenerating={isVideoGenerating}
      />

      <ProgressModal
        isOpen={isProgressModalOpen}
        onOpenChange={setIsProgressModalOpen}
        steps={generationSteps}
        isMultiChannel={isMultiChannelMode}
        currentChannelName={currentChannelName}
        currentChannelImage={currentChannelImage}
        completedCount={currentChannelIndex}
        totalCount={totalChannels}
      />

      {/* Completed dialog for both single and multi-channel modes */}
      <MultiChannelCompletedDialog
        isOpen={isMultiChannelCompletedDialogOpen}
        onOpenChange={(open) => {
          console.log('Index: MultiChannelCompletedDialog onOpenChange called with:', open);
          setIsMultiChannelCompletedDialogOpen(open);
        }}
        videos={completedMultiChannelVideos}
        apiUrl={API_URL}
      />

      <CreateProfileDialog
        isOpen={isCreateProfileDialogOpen}
        onOpenChange={(open) => {
          setIsCreateProfileDialogOpen(open);
          if (!open) {
            setChannelImage(null);
          }
        }}
        onCreateProfile={handleCreateProfile}
        channelImage={channelImage}
        onImageUpload={handleImageUpload}
        customFonts={customFonts}
        voices={voices}
        loadingVoices={loadingVoices}
      />
    </div>
  );
};

export default Index;