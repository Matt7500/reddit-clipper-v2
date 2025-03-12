import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { VideoGenerationData, VideoStatus } from '@/types/video';
import { getCacheItem, setCacheItem, removeCacheItem } from '@/utils/cache';

interface VideoGenerationContextType {
  videos: VideoGenerationData[];
  currentVideo: VideoGenerationData | null;
  loading: boolean;
  error: string | null;
  createVideo: (data: Pick<VideoGenerationData, 'channel_id' | 'hook_text' | 'script_text'>) => Promise<VideoGenerationData>;
  updateVideoStatus: (id: string, status: VideoStatus, error?: string) => Promise<void>;
  updateVideoAudio: (
    id: string, 
    hookAudioUrl: string, 
    hookAudioDuration: number, 
    scriptAudioUrl: string, 
    scriptAudioDuration: number
  ) => Promise<void>;
  updateVideoUrl: (id: string, videoUrl: string) => Promise<void>;
  deleteVideo: (id: string) => Promise<void>;
  getVideo: (id: string) => Promise<VideoGenerationData | null>;
  setCurrentVideo: (video: VideoGenerationData | null) => void;
  refreshVideos: () => Promise<void>;
}

const VIDEOS_CACHE_KEY = 'video_generation';

const VideoGenerationContext = createContext<VideoGenerationContextType>({
  videos: [],
  currentVideo: null,
  loading: true,
  error: null,
  createVideo: async () => { throw new Error('Not implemented') },
  updateVideoStatus: async () => { throw new Error('Not implemented') },
  updateVideoAudio: async () => { throw new Error('Not implemented') },
  updateVideoUrl: async () => { throw new Error('Not implemented') },
  deleteVideo: async () => { throw new Error('Not implemented') },
  getVideo: async () => { throw new Error('Not implemented') },
  setCurrentVideo: () => { throw new Error('Not implemented') },
  refreshVideos: async () => { throw new Error('Not implemented') },
});

export const useVideoGeneration = () => useContext(VideoGenerationContext);

export const VideoGenerationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoGenerationData[]>([]);
  const [currentVideo, setCurrentVideo] = useState<VideoGenerationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideosFromDatabase = async (userId: string) => {
    const { data, error } = await supabase
      .from('video_generation')
      .select('*, channel_profiles(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform the data to include channel information
    const processedVideos = data.map(video => ({
      ...video,
      channel_name: video.channel_profiles.name,
      channel_nickname: video.channel_profiles.nickname,
      channel_image_url: video.channel_profiles.image_url,
    }));

    return processedVideos;
  };

  useEffect(() => {
    const loadVideos = async () => {
      if (!user) {
        setVideos([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // First try to load from browser cache
        const cachedVideos = getCacheItem<VideoGenerationData[]>(VIDEOS_CACHE_KEY, user.id);
        
        if (cachedVideos) {
          console.log('Loading videos from browser cache');
          setVideos(cachedVideos);
          setLoading(false);
          
          // Update from DB in the background
          fetchVideosFromDatabase(user.id)
            .then(freshVideos => {
              setVideos(freshVideos);
              setCacheItem(VIDEOS_CACHE_KEY, freshVideos, user.id);
            })
            .catch(err => {
              console.error('Background videos fetch error:', err);
            });
          
          return;
        }

        // If no cache, fetch from database
        const freshVideos = await fetchVideosFromDatabase(user.id);
        setVideos(freshVideos);
        setCacheItem(VIDEOS_CACHE_KEY, freshVideos, user.id);
      } catch (err) {
        console.error('Error loading videos:', err);
        setError(err instanceof Error ? err.message : 'Unknown error loading videos');
      }

      setLoading(false);
    };

    loadVideos();
  }, [user]);

  const createVideo = async (data: Pick<VideoGenerationData, 'channel_id' | 'hook_text' | 'script_text'>) => {
    if (!user) {
      throw new Error('Cannot create video: User not logged in');
    }

    setLoading(true);
    setError(null);

    try {
      const { data: channel } = await supabase
        .from('channel_profiles')
        .select('*')
        .eq('id', data.channel_id)
        .single();

      if (!channel) {
        throw new Error('Channel not found');
      }

      const { data: video, error } = await supabase
        .from('video_generation')
        .insert([{
          user_id: user.id,
          channel_id: data.channel_id,
          hook_text: data.hook_text,
          script_text: data.script_text,
          status: 'draft' as VideoStatus,
        }])
        .select()
        .single();

      if (error) throw error;

      const newVideo = {
        ...video,
        channel_name: channel.name,
        channel_nickname: channel.nickname,
        channel_image_url: channel.image_url,
      };

      const updatedVideos = [newVideo, ...videos];
      setVideos(updatedVideos);
      setCacheItem(VIDEOS_CACHE_KEY, updatedVideos, user.id);
      setCurrentVideo(newVideo);

      return newVideo;
    } catch (err) {
      console.error('Error creating video:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateVideoStatus = async (id: string, status: VideoStatus, error?: string) => {
    if (!user) {
      throw new Error('Cannot update video: User not logged in');
    }

    try {
      const { error: updateError } = await supabase
        .from('video_generation')
        .update({
          status,
          error_message: error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      const updatedVideos = videos.map(v => 
        v.id === id ? { ...v, status, error_message: error } : v
      );
      setVideos(updatedVideos);
      setCacheItem(VIDEOS_CACHE_KEY, updatedVideos, user.id);

      if (currentVideo?.id === id) {
        setCurrentVideo(updatedVideos.find(v => v.id === id) || null);
      }
    } catch (err) {
      console.error('Error updating video status:', err);
      throw err;
    }
  };

  const updateVideoAudio = async (
    id: string,
    hookAudioUrl: string,
    hookAudioDuration: number,
    scriptAudioUrl: string,
    scriptAudioDuration: number
  ) => {
    if (!user) {
      throw new Error('Cannot update video: User not logged in');
    }

    try {
      const { error: updateError } = await supabase
        .from('video_generation')
        .update({
          hook_audio_url: hookAudioUrl,
          hook_audio_duration: hookAudioDuration,
          script_audio_url: scriptAudioUrl,
          script_audio_duration: scriptAudioDuration,
          status: 'audio_complete' as VideoStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      const updatedVideos = videos.map(v => 
        v.id === id ? {
          ...v,
          hook_audio_url: hookAudioUrl,
          hook_audio_duration: hookAudioDuration,
          script_audio_url: scriptAudioUrl,
          script_audio_duration: scriptAudioDuration,
          status: 'audio_complete',
        } : v
      );
      setVideos(updatedVideos);
      setCacheItem(VIDEOS_CACHE_KEY, updatedVideos, user.id);

      if (currentVideo?.id === id) {
        setCurrentVideo(updatedVideos.find(v => v.id === id) || null);
      }
    } catch (err) {
      console.error('Error updating video audio:', err);
      throw err;
    }
  };

  const updateVideoUrl = async (id: string, videoUrl: string) => {
    if (!user) {
      throw new Error('Cannot update video: User not logged in');
    }

    try {
      const { error: updateError } = await supabase
        .from('video_generation')
        .update({
          video_url: videoUrl,
          status: 'video_complete' as VideoStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      const updatedVideos = videos.map(v => 
        v.id === id ? { ...v, video_url: videoUrl, status: 'video_complete' } : v
      );
      setVideos(updatedVideos);
      setCacheItem(VIDEOS_CACHE_KEY, updatedVideos, user.id);

      if (currentVideo?.id === id) {
        setCurrentVideo(updatedVideos.find(v => v.id === id) || null);
      }
    } catch (err) {
      console.error('Error updating video URL:', err);
      throw err;
    }
  };

  const deleteVideo = async (id: string) => {
    if (!user) {
      throw new Error('Cannot delete video: User not logged in');
    }

    try {
      const videoToDelete = videos.find(v => v.id === id);
      if (!videoToDelete) return;

      // Delete associated files from storage
      if (videoToDelete.hook_audio_url) {
        await supabase.storage
          .from('audio-files')
          .remove([videoToDelete.hook_audio_url]);
      }
      if (videoToDelete.script_audio_url) {
        await supabase.storage
          .from('audio-files')
          .remove([videoToDelete.script_audio_url]);
      }
      if (videoToDelete.video_url) {
        await supabase.storage
          .from('videos')
          .remove([videoToDelete.video_url]);
      }

      const { error } = await supabase
        .from('video_generation')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      const updatedVideos = videos.filter(v => v.id !== id);
      setVideos(updatedVideos);
      setCacheItem(VIDEOS_CACHE_KEY, updatedVideos, user.id);

      if (currentVideo?.id === id) {
        setCurrentVideo(null);
      }
    } catch (err) {
      console.error('Error deleting video:', err);
      throw err;
    }
  };

  const getVideo = async (id: string): Promise<VideoGenerationData | null> => {
    // First check current videos array
    const cachedVideo = videos.find(v => v.id === id);
    if (cachedVideo) return cachedVideo;

    // If not found, fetch from database
    try {
      const { data, error } = await supabase
        .from('video_generation')
        .select('*, channel_profiles(*)')
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (error) throw error;
      if (!data) return null;

      const video = {
        ...data,
        channel_name: data.channel_profiles.name,
        channel_nickname: data.channel_profiles.nickname,
        channel_image_url: data.channel_profiles.image_url,
      };

      return video;
    } catch (err) {
      console.error('Error fetching video:', err);
      return null;
    }
  };

  const refreshVideos = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);

    try {
      const freshVideos = await fetchVideosFromDatabase(user.id);
      setVideos(freshVideos);
      setCacheItem(VIDEOS_CACHE_KEY, freshVideos, user.id);
    } catch (err) {
      console.error('Error refreshing videos:', err);
      setError(err instanceof Error ? err.message : 'Unknown error refreshing videos');
    }

    setLoading(false);
  };

  return (
    <VideoGenerationContext.Provider 
      value={{ 
        videos,
        currentVideo,
        loading,
        error,
        createVideo,
        updateVideoStatus,
        updateVideoAudio,
        updateVideoUrl,
        deleteVideo,
        getVideo,
        setCurrentVideo,
        refreshVideos,
      }}
    >
      {children}
    </VideoGenerationContext.Provider>
  );
}; 