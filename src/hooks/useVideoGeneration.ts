import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { useVideoGeneration as useVideoGenerationContext } from '@/contexts/VideoGenerationContext';
import { useElevenLabsSettings } from '@/hooks/useElevenLabsSettings';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ChannelProfile } from '@/types/channel';
import type { GenerationStep } from '@/components/video-generation/ProgressModal';

const API_URL = import.meta.env.VITE_API_URL;

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
  } | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [isCompletedVideoDialogOpen, setIsCompletedVideoDialogOpen] = useState(false);
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
    // Reset all steps to waiting
    setGenerationSteps(steps => steps.map(step => ({ ...step, status: 'waiting' })));

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
    } catch (error) {
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

    let audioResult: { hookAudio: string; scriptAudio: string } | null = null;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new chunk to buffer and split by double newlines
        buffer += new TextDecoder().decode(value);
        const updates = buffer.split('\n\n');
        
        // Process all complete messages except the last one
        for (let i = 0; i < updates.length - 1; i++) {
          const update = updates[i].trim();
          if (update) {
            try {
              const data = JSON.parse(update);
              console.log('Received status update:', data);
              
              if (data.type === 'status_update') {
                switch (data.status) {
                  case 'audio_processing':
                    updateStepStatus('audio', 'processing');
                    break;
                  
                  case 'audio_complete':
                    console.log('Audio generation completed');
                    updateStepStatus('audio', 'completed');
                    updateStepStatus('transcription', 'processing');
                    audioResult = {
                      hookAudio: data.hookAudio,
                      scriptAudio: data.scriptAudio
                    };
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
                    updateStepStatus('background', 'processing');
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
                        scriptAudio: data.scriptAudio
                      };
                    }
                    // Set completed video data
                    setCompletedVideo({
                      hookVideo: data.hookVideo,
                      hookAudio: data.hookAudio,
                      scriptAudio: data.scriptAudio,
                      subtitle_size: data.subtitle_size,
                      stroke_size: data.stroke_size,
                      has_background_music: data.has_background_music
                    });
                    // Close progress modal and open completed video dialog
                    setIsProgressModalOpen(false);
                    setIsCompletedVideoDialogOpen(true);
                    break;

                  case 'error':
                    // Find the current processing step and mark it as error
                    const processingStep = generationSteps.find(step => step.status === 'processing');
                    if (processingStep) {
                      updateStepStatus(processingStep.id, 'error', data.message || 'An error occurred');
                    }
                    throw new Error(data.message || 'An error occurred during processing');
                }
              }
            } catch (e) {
              console.error('Error parsing update:', e, 'Raw update:', update);
            }
          }
        }
        
        // Keep the last potentially incomplete message in the buffer
        buffer = updates[updates.length - 1];
      }
    } finally {
      reader.releaseLock();
    }

    if (!audioResult) {
      throw new Error('No audio result received from server');
    }
    
    return audioResult;
  };

  return {
    isGenerating,
    audioResult,
    completedVideo,
    generationSteps,
    generateVideo,
    updateStepStatus,
    isProgressModalOpen,
    setIsProgressModalOpen,
    isCompletedVideoDialogOpen,
    setIsCompletedVideoDialogOpen
  };
} 