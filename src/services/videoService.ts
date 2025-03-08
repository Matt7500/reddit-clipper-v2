import { supabase } from '@/integrations/supabase/client';
import { Video, VideoSort, VideoPagination } from '@/types/video';

export const videoService = {
  async uploadVideo(file: File, metadata: Omit<Video, 'id' | 'user_id' | 'created_at' | 'views' | 'video_url' | 'thumbnail_url'>) {
    try {
      // Upload video file
      const videoFileName = `${Date.now()}-${file.name}`;
      const { data: videoData, error: videoError } = await supabase.storage
        .from('videos')
        .upload(videoFileName, file);

      if (videoError) throw videoError;

      // Get video URL
      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(videoFileName);

      // Generate thumbnail (you'll need to implement this)
      const thumbnailFileName = `${Date.now()}-thumbnail.jpg`;
      // ... thumbnail generation logic ...

      // Insert video metadata
      const { data, error } = await supabase
        .from('videos')
        .insert({
          ...metadata,
          video_url: videoUrl,
          thumbnail_url: '', // Add thumbnail URL once generated
          views: 0
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error uploading video:', error);
      throw error;
    }
  },

  async getVideos(userId: string, pagination: VideoPagination, sort?: VideoSort) {
    try {
      // First, get the user's channels
      const { data: channels, error: channelsError } = await supabase
        .from('channel_profiles')
        .select('name, image_url')
        .eq('user_id', userId);

      if (channelsError) throw channelsError;

      // Then get the videos
      let query = supabase
        .from('videos')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      // Apply sorting
      if (sort) {
        query = query.order(sort.column, { ascending: sort.ascending });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply pagination
      const from = pagination.page * pagination.pageSize;
      const to = from + pagination.pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Process URLs and add channel images
      const processedData = data?.map(video => {
        let processedVideo = { ...video };

        // Process thumbnail URL
        if (video.thumbnail_url && !video.thumbnail_url.startsWith('http')) {
          const thumbnailPath = video.thumbnail_url.startsWith('/') ? video.thumbnail_url.slice(1) : video.thumbnail_url;
          const { data: { publicUrl } } = supabase.storage
            .from('thumbnails')
            .getPublicUrl(thumbnailPath);
          processedVideo.thumbnail_url = publicUrl;
        }

        // Find matching channel and add its image URL
        const matchingChannel = channels?.find(channel => channel.name === video.channel_name);
        if (matchingChannel) {
          processedVideo.channel_image_url = matchingChannel.image_url;
        }

        return processedVideo;
      });

      return { data: processedData || [], count };
    } catch (error) {
      console.error('Error fetching videos:', error);
      throw error;
    }
  },

  async deleteVideo(videoId: string) {
    try {
      // Get video data first to get file names
      const { data: video, error: fetchError } = await supabase
        .from('videos')
        .select('video_url, thumbnail_url')
        .eq('id', videoId)
        .single();

      if (fetchError) throw fetchError;

      // Delete from storage
      if (video) {
        const videoFileName = video.video_url.split('/').pop();
        const thumbnailFileName = video.thumbnail_url.split('/').pop();

        await supabase.storage.from('videos').remove([videoFileName]);
        if (thumbnailFileName) {
          await supabase.storage.from('thumbnails').remove([thumbnailFileName]);
        }
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (deleteError) throw deleteError;
    } catch (error) {
      console.error('Error deleting video:', error);
      throw error;
    }
  },

  async incrementViews(videoId: string) {
    try {
      const { error } = await supabase.rpc('increment_video_views', { video_id: videoId });
      if (error) throw error;
    } catch (error) {
      console.error('Error incrementing views:', error);
      throw error;
    }
  }
}; 