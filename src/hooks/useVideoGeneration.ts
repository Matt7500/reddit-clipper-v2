import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { useVideoGeneration as useVideoGenerationContext } from '@/contexts/VideoGenerationContext';
import { useElevenLabsSettings } from '@/hooks/useElevenLabsSettings';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ChannelProfile } from '@/types/channel';
import type { GenerationStep } from '@/components/video-generation/ProgressModal';

const API_URL = import.meta.env.VITE_API_URL;

// Interface for multi-channel video generation
interface ChannelScript {
  channelId: string;
  hook: string;
  script: string;
  expanded: boolean;
}

interface CompletedMultiChannelVideo {
  channelId: string;
  channelName: string;
  channelNickname?: string;
  channelImageUrl?: string;
  title: string;
  videoUrl: string;
}

export function useVideoGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioResult, setAudioResult] = useState<{ hookAudio: string; scriptAudio: string } | null>(null);
  const [completedVideo, setCompletedVideo] = useState<{
    hookVideo: string;
    hookAudio: string;
    scriptAudio: string;
    subtitle_size: number;
    stroke_size: number;
    has_background_music: boolean;
    channelName?: string;
    channelNickname?: string;
  } | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [isCompletedVideoDialogOpen, setIsCompletedVideoDialogOpen] = useState(false);
  
  // New state for multi-channel video generation
  const [isMultiChannelMode, setIsMultiChannelMode] = useState(false);
  const [completedMultiChannelVideos, setCompletedMultiChannelVideos] = useState<CompletedMultiChannelVideo[]>([]);
  const [isMultiChannelCompletedDialogOpen, setIsMultiChannelCompletedDialogOpen] = useState(false);
  const [currentChannelIndex, setCurrentChannelIndex] = useState(0);
  const [totalChannels, setTotalChannels] = useState(0);
  const [currentChannelName, setCurrentChannelName] = useState('');
  const [currentChannelImage, setCurrentChannelImage] = useState<string | null>(null);
  
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([
    {
      id: 'create',
      title: 'Initializing',
      description: 'Creating video record...',
      status: 'waiting'
    },
    {
      id: 'audio',
      title: 'Audio Generation',
      description: 'Converting text to speech and processing audio...',
      status: 'waiting'
    },
    {
      id: 'transcription',
      title: 'Transcription',
      description: 'Generating word-level subtitles...',
      status: 'waiting'
    },
    {
      id: 'video',
      title: 'Video Generation',
      description: 'Rendering final video...',
      status: 'waiting'
    }
  ]);

  const { toast } = useToast();
  const { createVideo, updateVideoStatus } = useVideoGenerationContext();
  const { apiKey: elevenlabsApiKey, voiceModel: elevenlabsVoiceModel } = useElevenLabsSettings();
  const { settings: userSettings } = useUserSettings();
  const { user } = useAuth();

  const updateStepStatus = (stepId: string, status: GenerationStep['status'], error?: string) => {
    setGenerationSteps(steps => 
      steps.map(step => 
        step.id === stepId 
          ? { ...step, status, ...(error ? { error } : {}) }
          : step
      )
    );
  };

  const resetSteps = () => {
    setGenerationSteps(steps => steps.map(step => ({ ...step, status: 'waiting', error: undefined })));
  };

  const generateVideo = async (
    hook: string,
    script: string,
    selectedChannelId: string,
    channel: ChannelProfile
  ) => {
    if (!hook.trim() || !script.trim()) {
      toast({
        title: "Missing content",
        description: "Please provide both a hook and a script",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setIsGenerating(true);
    setAudioResult(null);
    setCompletedVideo(null);
    setIsProgressModalOpen(true);
    setIsMultiChannelMode(false);
    resetSteps();

    let videoData;
    try {
      // Create video record
      updateStepStatus('create', 'processing');
      videoData = await createVideo({
        channel_id: selectedChannelId,
        hook_text: hook,
        script_text: script,
      });
      updateStepStatus('create', 'completed');

      // Update status to processing
      await updateVideoStatus(videoData.id, 'audio_processing');

      // Check if ElevenLabs API key is available
      if (!elevenlabsApiKey) {
        throw new Error('ElevenLabs API key not found. Please add it in Settings.');
      }

      // Start audio generation
      updateStepStatus('audio', 'processing');
      const result = await generateAudioForChannel(
        channel,
        hook,
        script,
        elevenlabsApiKey,
        userSettings
      );

      setAudioResult(result);
      
      // Update video status to completed
      await updateVideoStatus(videoData.id, 'video_complete');
      
      toast({
        title: "Video generation completed",
        description: "Your video has been generated successfully.",
        duration: 2000,
      });
    } catch (error: any) {
      console.error('Video generation error:', error);
      // Find the first processing step and mark it as error
      const processingStep = generationSteps.find(step => step.status === 'processing');
      if (processingStep) {
        updateStepStatus(processingStep.id, 'error', error instanceof Error ? error.message : 'An unknown error occurred');
      }

      if (videoData) {
        await updateVideoStatus(
          videoData.id, 
          'failed',
          error instanceof Error ? error.message : "Something went wrong while processing video."
        );
      }
      toast({
        title: "Error generating video",
        description: error instanceof Error ? error.message : "Something went wrong while generating video.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // New function to generate videos for multiple channels
  const generateMultiChannelVideos = async (
    channelScripts: ChannelScript[],
    channels: ChannelProfile[]
  ) => {
    if (channelScripts.length === 0) {
      toast({
        title: "No channels selected",
        description: "Please select at least one channel and provide content",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setIsGenerating(true);
    setAudioResult(null);
    setCompletedVideo(null);
    setCompletedMultiChannelVideos([]);
    setIsProgressModalOpen(true);
    setIsMultiChannelMode(true);
    setCurrentChannelIndex(0);
    setTotalChannels(channelScripts.length);
    resetSteps();

    // Process each channel one by one
    for (let i = 0; i < channelScripts.length; i++) {
      setCurrentChannelIndex(i);
      const channelScript = channelScripts[i];
      const channel = channels.find(c => c.id === channelScript.channelId);
      
      if (!channel) {
        console.error(`Channel with ID ${channelScript.channelId} not found`);
        continue;
      }

      // Update current channel info
      setCurrentChannelName(channel.nickname ? `${channel.nickname} (${channel.name})` : channel.name);
      setCurrentChannelImage(channel.image_url);
      
      // Reset steps for this channel
      resetSteps();

      try {
        // Create video record
        updateStepStatus('create', 'processing');
        const videoData = await createVideo({
          channel_id: channelScript.channelId,
          hook_text: channelScript.hook,
          script_text: channelScript.script,
        });
        updateStepStatus('create', 'completed');

        // Update status to processing
        await updateVideoStatus(videoData.id, 'audio_processing');

        // Check if ElevenLabs API key is available
        if (!elevenlabsApiKey) {
          throw new Error('ElevenLabs API key not found. Please add it in Settings.');
        }

        // Start audio generation
        updateStepStatus('audio', 'processing');
        const result = await generateAudioForChannel(
          channel,
          channelScript.hook,
          channelScript.script,
          elevenlabsApiKey,
          userSettings
        );

        // Add to completed videos
        if (result && result.hookVideo) {
          setCompletedMultiChannelVideos(prev => [
            ...prev,
            {
              channelId: channel.id,
              channelName: channel.name,
              channelNickname: channel.nickname,
              channelImageUrl: channel.image_url,
              title: channelScript.hook,
              videoUrl: result.hookVideo
            }
          ]);
        }
        
        // Update video status to completed
        await updateVideoStatus(videoData.id, 'video_complete');
      } catch (error: any) {
        console.error(`Error generating video for channel ${channel.name}:`, error);
        // Find the first processing step and mark it as error
        const processingStep = generationSteps.find(step => step.status === 'processing');
        if (processingStep) {
          updateStepStatus(processingStep.id, 'error', error instanceof Error ? error.message : 'An unknown error occurred');
        }

        toast({
          title: `Error generating video for ${channel.name}`,
          description: error instanceof Error ? error.message : "Something went wrong while generating video.",
          variant: "destructive",
          duration: 5000,
        });
        
        // Wait a moment before continuing to the next channel
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // All videos processed
    setIsGenerating(false);
    setIsProgressModalOpen(false);
    
    // Show completed videos dialog if we have any successful generations
    if (completedMultiChannelVideos.length > 0) {
      setIsMultiChannelCompletedDialogOpen(true);
      toast({
        title: "Video generation completed",
        description: `Generated ${completedMultiChannelVideos.length} out of ${channelScripts.length} videos successfully.`,
        duration: 3000,
      });
    } else {
      toast({
        title: "Video generation failed",
        description: "Failed to generate any videos. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const generateAudioForChannel = async (
    channel: ChannelProfile, 
    hookText: string, 
    scriptText: string, 
    apiKey: string,
    settings: any
  ) => {
    // Check if we have a voice model
    if (!elevenlabsVoiceModel) {
      throw new Error('Voice model not found. Please configure it in Settings.');
    }

    if (!user) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_URL}/api/generate-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hook: hookText,
        script: scriptText,
        userId: user.id,
        channelId: channel.id,
        channelName: channel.name,
        channelImageUrl: channel.image_url,
        channelFont: channel.font,
        channelVoiceId: channel.voice_id,
        channelStyle: channel.style || 'grouped',
        elevenlabsApiKey: apiKey,
        elevenlabsVoiceModel: elevenlabsVoiceModel,
        openaiApiKey: settings.openaiApiKey,
        openrouterApiKey: settings.openrouterApiKey,
        openrouterModel: settings.openrouterModel,
        useUserSettings: true,
        target_duration: channel.target_duration,
        subtitle_size: channel.subtitle_size || 64,
        stroke_size: channel.stroke_size || 8,
        has_background_music: channel.has_background_music || false,
        background_video_type: channel.background_video_type || 'gameplay',
        pitch_up: channel.pitch_up || false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    let audioResult: { 
      hookAudio: string; 
      scriptAudio: string;
      hookVideo?: string;
    } | null = null;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // Convert the Uint8Array to a string
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;
        
        // Split by newlines and process each line
        const updates = buffer.split('\n');
        buffer = updates.pop() || '';
        
        for (let i = 0; i < updates.length; i++) {
          const update = updates[i].trim();
          
          if (!update || !update.startsWith('data:')) {
            continue;
          }
          
          try {
            const jsonStr = update.slice(5).trim();
            const data = JSON.parse(jsonStr);
            
            switch (data.status) {
              case 'audio_processing':
                updateStepStatus('audio', 'processing');
                break;
              
              case 'audio_complete':
                console.log('Audio generation completed');
                updateStepStatus('audio', 'completed');
                updateStepStatus('transcription', 'processing');
                break;
              
              case 'transcription_processing':
                updateStepStatus('transcription', 'processing');
                break;
              
              case 'transcription_complete':
                console.log('Transcription completed');
                updateStepStatus('transcription', 'completed');
                updateStepStatus('video', 'processing');
                break;
              
              case 'background_processing':
                console.log('Background generation started');
                break;
              
              case 'background_complete':
                console.log('Background generation completed');
                updateStepStatus('background', 'completed');
                updateStepStatus('video', 'processing');
                break;
              
              case 'video_processing':
                updateStepStatus('video', 'processing');
                break;
              
              case 'video_complete':
                console.log('Video generation completed');
                updateStepStatus('video', 'completed');
                if (!audioResult && data.hookAudio && data.scriptAudio) {
                  audioResult = {
                    hookAudio: data.hookAudio,
                    scriptAudio: data.scriptAudio,
                    hookVideo: data.hookVideo
                  };
                }
                
                // Only set completed video and show dialog in single channel mode
                if (!isMultiChannelMode) {
                  // Set completed video data
                  setCompletedVideo({
                    hookVideo: data.hookVideo,
                    hookAudio: data.hookAudio,
                    scriptAudio: data.scriptAudio,
                    subtitle_size: data.subtitle_size,
                    stroke_size: data.stroke_size,
                    has_background_music: data.has_background_music,
                    channelName: channel.name,
                    channelNickname: data.channelNickname
                  });
                  // Close progress modal and open completed video dialog
                  setIsProgressModalOpen(false);
                  setIsCompletedVideoDialogOpen(true);
                }
                break;
              
              case 'error':
                console.error('Error from server:', data.message);
                throw new Error(data.message || 'Unknown error occurred during video generation');
            }
          } catch (err) {
            console.error('Error parsing server update:', err, update);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return audioResult;
  };

  return {
    isGenerating,
    completedVideo,
    generationSteps,
    generateVideo,
    isProgressModalOpen,
    setIsProgressModalOpen,
    isCompletedVideoDialogOpen,
    setIsCompletedVideoDialogOpen,
    // New multi-channel properties
    generateMultiChannelVideos,
    isMultiChannelMode,
    completedMultiChannelVideos,
    isMultiChannelCompletedDialogOpen,
    setIsMultiChannelCompletedDialogOpen,
    currentChannelIndex,
    totalChannels,
    currentChannelName,
    currentChannelImage
  };
} 