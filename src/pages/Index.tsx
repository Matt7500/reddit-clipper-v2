import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoGallery } from "@/components/VideoGallery";
import { Play, Settings as SettingsIcon, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChannels } from "@/hooks/useChannels";
import { useVideoGeneration } from "@/hooks/useVideoGeneration";
import { ChannelSelectionModal } from "@/components/video-generation/ChannelSelectionModal";
import { WritingMethodModal } from "@/components/video-generation/WritingMethodModal";
import { ScriptGenerationModal } from "@/components/video-generation/ScriptGenerationModal";
import { ContentInputModal } from "@/components/video-generation/ContentInputModal";
import { ProgressModal } from "@/components/video-generation/ProgressModal";
import { CompletedVideoDialog } from "@/components/video-generation/CompletedVideoDialog";
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
  const [isChannelDialogOpen, setIsChannelDialogOpen] = useState(false);
  const [isWritingMethodDialogOpen, setIsWritingMethodDialogOpen] = useState(false);
  const [isContentDialogOpen, setIsContentDialogOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | 'all' | null>(null);
  const [hook, setHook] = useState("");
  const [script, setScript] = useState("");
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  
  // New state for multi-channel
  const [isMultiChannelScriptModalOpen, setIsMultiChannelScriptModalOpen] = useState(false);
  
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
    completedVideo,
    generationSteps,
    generateVideo,
    isProgressModalOpen,
    setIsProgressModalOpen,
    isCompletedVideoDialogOpen,
    setIsCompletedVideoDialogOpen,
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
    target_duration: number;
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

  const handleStartGeneration = () => {
    if (channels.length === 0) {
      toast({
        title: "No channels found",
        description: "You need to create a channel first. Redirecting to settings...",
        duration: 2000,
      });
      setTimeout(() => navigate('/settings'), 1500);
    } else {
      setIsChannelDialogOpen(true);
    }
  };

  const handleChannelSelect = (channelId: string | 'all') => {
    setSelectedChannelId(channelId);
  };

  const handleChannelContinue = () => {
    setIsChannelDialogOpen(false);
    
    // If "all channels" is selected, go directly to multi-channel script modal
    if (selectedChannelId === 'all') {
      setIsMultiChannelScriptModalOpen(true);
    } else {
      setIsWritingMethodDialogOpen(true);
    }
  };

  const handleSelectAI = () => {
    setIsWritingMethodDialogOpen(false);
    setIsScriptModalOpen(true);
  };

  const handleSelectManual = () => {
    setIsWritingMethodDialogOpen(false);
    setIsContentDialogOpen(true);
  };

  const handleManualWrite = () => {
    setIsScriptModalOpen(false);
    setIsContentDialogOpen(true);
  };

  const handleGenerate = async () => {
    setIsContentDialogOpen(false);
    setIsProgressModalOpen(true);

    if (selectedChannelId && selectedChannelId !== 'all') {
      const channel = channels.find((c: ChannelProfile) => c.id === selectedChannelId);
      if (channel) {
        // Make sure hook is not empty
        const finalHook = hook.trim() || "Generated Video";
        setHook(finalHook);
        await generateVideo(finalHook, script, selectedChannelId, channel);
      }
    }
  };

  const handleGenerateFromScript = async (hook: string, script: string) => {
    setIsScriptModalOpen(false);
    setIsProgressModalOpen(true);

    if (selectedChannelId && selectedChannelId !== 'all') {
      const channel = channels.find((c: ChannelProfile) => c.id === selectedChannelId);
      if (channel) {
        // Make sure hook is not empty and update the state
        const finalHook = hook.trim() || "Generated Video";
        setHook(finalHook);
        await generateVideo(finalHook, script, selectedChannelId, channel);
      }
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
          <VideoGallery />
        </div>
      </div>

      <ChannelSelectionModal
        isOpen={isChannelDialogOpen}
        onOpenChange={setIsChannelDialogOpen}
        selectedChannelId={selectedChannelId}
        onChannelSelect={handleChannelSelect}
        onContinue={handleChannelContinue}
        channels={channels}
        isLoadingChannels={isLoadingChannels}
        onCreateChannel={() => setIsCreateProfileDialogOpen(true)}
      />

      <WritingMethodModal
        isOpen={isWritingMethodDialogOpen}
        onOpenChange={setIsWritingMethodDialogOpen}
        onSelectAI={handleSelectAI}
        onSelectManual={handleSelectManual}
      />

      <ScriptGenerationModal
        isOpen={isScriptModalOpen}
        onOpenChange={setIsScriptModalOpen}
        selectedChannelId={selectedChannelId}
        channels={channels}
        onManualWrite={handleManualWrite}
        onGenerateVideo={handleGenerateFromScript}
        isGenerating={isVideoGenerating}
      />

      <ContentInputModal
        isOpen={isContentDialogOpen}
        onOpenChange={setIsContentDialogOpen}
        selectedChannelId={selectedChannelId}
        channels={channels}
        hook={hook}
        script={script}
        onHookChange={setHook}
        onScriptChange={setScript}
        onBackToOptions={() => {
          setIsContentDialogOpen(false);
          setIsWritingMethodDialogOpen(true);
        }}
        onGenerate={handleGenerate}
        isGenerating={isVideoGenerating}
      />

      {/* Multi-channel script modal */}
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

      <CompletedVideoDialog
        isOpen={isCompletedVideoDialogOpen}
        onOpenChange={setIsCompletedVideoDialogOpen}
        videoData={completedVideo ? {
          ...completedVideo,
          title: hook || "Generated Video",
          channelName: selectedChannelId === 'all' 
            ? 'All-Channels' 
            : channels.find(c => c.id === selectedChannelId)?.name || '',
          channelNickname: selectedChannelId === 'all'
            ? 'All-Channels'
            : channels.find(c => c.id === selectedChannelId)?.nickname || undefined
        } : null}
        apiUrl={API_URL}
      />

      {/* Multi-channel completed dialog */}
      <MultiChannelCompletedDialog
        isOpen={isMultiChannelCompletedDialogOpen}
        onOpenChange={setIsMultiChannelCompletedDialogOpen}
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