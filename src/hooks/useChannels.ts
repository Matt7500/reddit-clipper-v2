import { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ChannelProfile } from "@/types/channel";

export function useChannels() {
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const { toast } = useToast();

  const fetchChannels = async () => {
    setIsLoadingChannels(true);
    try {
      const { data, error } = await supabase
        .from('channel_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process profiles to refresh signed URLs if needed
      const processedChannels = await Promise.all(data.map(async (channel) => {
        if (!channel.image_url) return channel;
        
        try {
          // Extract the path from the URL
          let path = '';
          if (channel.image_url.includes('?token=')) {
            // It's a signed URL, extract the path before the token
            path = channel.image_url.split('?token=')[0].split('/profile-images/')[1];
          } else if (channel.image_url.includes('/public/profile-images/')) {
            // It's a public URL
            path = channel.image_url.split('/public/profile-images/')[1];
          } else if (channel.image_url.includes('/sign/profile-images/')) {
            // It's a signed URL with a different format
            path = channel.image_url.split('/sign/profile-images/')[1].split('?')[0];
          }
          
          if (path) {
            // Generate a fresh signed URL with longer expiration
            const { data } = await supabase.storage
              .from('profile-images')
              .createSignedUrl(path, 7 * 24 * 60 * 60); // 7 days
            
            if (data?.signedUrl) {
              return { ...channel, image_url: data.signedUrl };
            }
          }
        } catch (error) {
          console.error(`Error refreshing signed URL for channel ${channel.id}:`, error);
        }
        
        return channel;
      }));

      setChannels(processedChannels);
    } catch (error) {
      console.error('Error fetching channels:', error);
      toast({
        title: "Error fetching channels",
        description: "Failed to load your channels. Please try again.",
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setIsLoadingChannels(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  return {
    channels,
    isLoadingChannels,
    fetchChannels
  };
} 