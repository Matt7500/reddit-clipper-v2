import { useState, useEffect } from 'react';
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
  
  // Simplified state for completed videos
  const [completedMultiChannelVideos, setCompletedMultiChannelVideos] = useState<CompletedMultiChannelVideo[]>([]);
  const [isMultiChannelCompletedDialogOpen, setIsMultiChannelCompletedDialogOpen] = useState(false);
  
  // Progress modal state
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [isMultiChannelMode, setIsMultiChannelMode] = useState(false);
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
    setCompletedMultiChannelVideos([]);
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
      
      // Add to completed videos array for the dialog
      if (result && result.hookVideo) {
        console.log('Setting completed video and showing dialog');
        
        // Add to multi-channel videos array for the dialog
        setCompletedMultiChannelVideos([{
          channelId: channel.id,
          channelName: channel.name,
          channelNickname: channel.nickname,
          channelImageUrl: channel.image_url,
          title: hook,
          videoUrl: result.hookVideo
        }]);
        
        // Close progress modal and open completed dialog
        setIsProgressModalOpen(false);
        setIsMultiChannelCompletedDialogOpen(true);
      }
      
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

  // Function to generate videos for multiple channels
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
          const newVideo = {
            channelId: channel.id,
            channelName: channel.name,
            channelNickname: channel.nickname,
            channelImageUrl: channel.image_url,
            title: channelScript.hook,
            videoUrl: result.hookVideo
          };
          
          console.log('Adding completed video to list:', newVideo);
          setCompletedMultiChannelVideos(prev => [...prev, newVideo]);
        }
        
        // Update video status to completed
        await updateVideoStatus(videoData.id, 'video_complete');
        
        // If this is not the last channel, prepare for the next one
        if (i < channelScripts.length - 1) {
          // Short delay before moving to the next channel
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Update current channel index for the progress modal
          setCurrentChannelIndex(i + 1);
          
          // Get the next channel
          const nextChannelScript = channelScripts[i + 1];
          const nextChannel = channels.find(c => c.id === nextChannelScript.channelId);
          
          if (nextChannel) {
            // Update current channel info for the progress modal
            setCurrentChannelName(nextChannel.nickname 
              ? `${nextChannel.nickname} (${nextChannel.name})` 
              : nextChannel.name);
            setCurrentChannelImage(nextChannel.image_url);
          }
          
          // Reset steps for the next channel
          resetSteps();
          
          console.log(`Moving to next channel (${i + 1}/${channelScripts.length})`);
        }
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
      
      // Check if this is the last channel
      if (i === channelScripts.length - 1) {
        console.log('Last channel processed');
        setIsGenerating(false);
        setIsProgressModalOpen(false);
        
        // Show completed videos dialog if we have any successful generations
        if (completedMultiChannelVideos.length > 0) {
          console.log('Showing completed dialog with videos:', completedMultiChannelVideos);
          
          // Show the completed dialog
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
      }
    }
  };

  const generateAudioForChannel = async (
    channel: ChannelProfile, 
    hookText: string, 
    scriptText: string, 
    apiKey: string,
    settings: any
  ) => {
    console.log(`Starting video generation for channel: ${channel.name}`);
    
    // Check if we have a voice model
    if (!elevenlabsVoiceModel) {
      throw new Error('Voice model not found. Please configure it in Settings.');
    }

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Set up a fallback timer to advance steps if server updates are missed
    let currentStep = 'audio';
    const stepTimeouts: Record<string, NodeJS.Timeout> = {};
    
    const setupStepFallback = (step: string, nextStep: string, timeoutMs: number) => {
      // Clear any existing timeout for this step
      if (stepTimeouts[step]) {
        clearTimeout(stepTimeouts[step]);
      }
      
      // Set a new timeout
      stepTimeouts[step] = setTimeout(() => {
        const steps = generationSteps.find(s => s.id === step);
        // Only advance if the step is still processing
        if (steps && steps.status === 'processing') {
          console.log(`Fallback: Advancing from ${step} to ${nextStep} after timeout`);
          updateStepStatus(step, 'completed');
          updateStepStatus(nextStep, 'processing');
          currentStep = nextStep;
          
          // Set up the next fallback
          if (nextStep === 'transcription') {
            setupStepFallback('transcription', 'video', 60000); // 1 minute for transcription
          } else if (nextStep === 'video') {
            setupStepFallback('video', 'complete', 180000); // 3 minutes for video generation
          }
        }
      }, timeoutMs);
    };
    
    // Set up the first fallback for audio processing
    setupStepFallback('audio', 'transcription', 60000); // 1 minute for audio processing

    console.log('Making API request to generate video');
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

    console.log('Received successful response from server, setting up stream reader');
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
      console.log('Starting to read stream from server');
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream ended');
          break;
        }
        
        // Convert the Uint8Array to a string
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;
        
        // Split by double newlines (server sends \n\n between messages)
        const updates = buffer.split('\n\n');
        buffer = updates.pop() || '';
        
        console.log(`Processing ${updates.length} updates from stream`);
        
        for (let i = 0; i < updates.length; i++) {
          const update = updates[i].trim();
          
          if (!update) {
            continue;
          }
          
          try {
            // Parse the JSON directly without expecting data: prefix
            const data = JSON.parse(update);
            
            // Only process status_update type messages
            if (data.type !== 'status_update') {
              console.log('Received non-status update:', data);
              continue;
            }
            
            console.log('Received status update:', data.status);
            
            switch (data.status) {
              case 'audio_processing':
                updateStepStatus('audio', 'processing');
                currentStep = 'audio';
                // Reset the fallback timer
                setupStepFallback('audio', 'transcription', 60000);
                break;
              
              case 'audio_complete':
                console.log('Audio generation completed');
                updateStepStatus('audio', 'completed');
                updateStepStatus('transcription', 'processing');
                currentStep = 'transcription';
                // Clear audio timeout and set up transcription fallback
                if (stepTimeouts['audio']) {
                  clearTimeout(stepTimeouts['audio']);
                }
                setupStepFallback('transcription', 'video', 60000);
                break;
              
              case 'transcription_processing':
                updateStepStatus('transcription', 'processing');
                currentStep = 'transcription';
                // Reset the fallback timer
                setupStepFallback('transcription', 'video', 60000);
                break;
              
              case 'transcription_complete':
                console.log('Transcription completed');
                updateStepStatus('transcription', 'completed');
                updateStepStatus('video', 'processing');
                currentStep = 'video';
                // Clear transcription timeout and set up video fallback
                if (stepTimeouts['transcription']) {
                  clearTimeout(stepTimeouts['transcription']);
                }
                setupStepFallback('video', 'complete', 180000);
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
                
                // Clear all timeouts
                Object.keys(stepTimeouts).forEach(key => {
                  if (stepTimeouts[key]) {
                    clearTimeout(stepTimeouts[key]);
                  }
                });
                
                // Store audio and video URLs
                const videoResult = {
                  hookAudio: data.hookAudio || '',
                  scriptAudio: data.scriptAudio || '',
                  hookVideo: data.hookVideo || ''
                };
                
                // Update audioResult for return value
                audioResult = videoResult;
                
                // Add video to completed videos list
                const newCompletedVideo = {
                  channelId: channel.id,
                  channelName: channel.name,
                  channelNickname: channel.nickname,
                  channelImageUrl: channel.image_url,
                  title: hookText,
                  videoUrl: data.hookVideo
                };
                
                console.log('Adding video to completed list:', newCompletedVideo);
                
                // For single-channel mode, we'll show the dialog immediately
                if (!isMultiChannelMode) {
                  // Add to multi-channel videos array for the dialog
                  setCompletedMultiChannelVideos([newCompletedVideo]);
                  
                  // Close progress modal and open completed dialog
                  setIsProgressModalOpen(false);
                  setIsMultiChannelCompletedDialogOpen(true);
                } else {
                  // For multi-channel mode, just add to completed videos
                  // Don't close the progress modal or show any dialog yet
                  setCompletedMultiChannelVideos(prev => [...prev, newCompletedVideo]);
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
      
      // Clean up any remaining timeouts
      Object.keys(stepTimeouts).forEach(key => {
        if (stepTimeouts[key]) {
          clearTimeout(stepTimeouts[key]);
        }
      });
    }
    
    return audioResult;
  };

  // Add useEffect to monitor completedMultiChannelVideos
  useEffect(() => {
    // Only proceed if we have completed videos and we're not generating
    if (completedMultiChannelVideos.length > 0 && !isGenerating) {
      console.log('useEffect: Detected completed videos:', completedMultiChannelVideos.length);
      
      // If we're not showing the dialog and we're not generating, show it
      if (!isMultiChannelCompletedDialogOpen && !isProgressModalOpen) {
        console.log('useEffect: Opening completed dialog');
        setIsMultiChannelCompletedDialogOpen(true);
      }
    }
  }, [completedMultiChannelVideos, isGenerating, isMultiChannelCompletedDialogOpen, isProgressModalOpen]);

  return {
    isGenerating,
    generationSteps,
    generateVideo,
    isProgressModalOpen,
    setIsProgressModalOpen,
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