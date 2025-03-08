import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ChannelProfile } from '@/types/channel';
import { getCacheItem, setCacheItem, removeCacheItem } from '@/utils/cache';
import { cacheService } from "@/lib/cache/cache-service";

interface ChannelProfileContextType {
  profiles: ChannelProfile[];
  loading: boolean;
  error: string | null;
  createProfile: (profile: Omit<ChannelProfile, 'id' | 'user_id'>) => Promise<void>;
  updateProfile: (id: string, updates: Partial<ChannelProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  clearProfiles: () => void;
}

const PROFILES_CACHE_KEY = 'channel_profiles';

const ChannelProfileContext = createContext<ChannelProfileContextType>({
  profiles: [],
  loading: true,
  error: null,
  createProfile: async () => {},
  updateProfile: async () => {},
  deleteProfile: async () => {},
  refreshProfiles: async () => {},
  clearProfiles: () => {},
});

export const useChannelProfiles = () => useContext(ChannelProfileContext);

export const ChannelProfileProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ChannelProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfilesFromDatabase = async (userId: string) => {
    const { data, error } = await supabase
      .from('channel_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Process profiles to refresh signed URLs and ensure style property
    const processedProfiles = await Promise.all(data.map(async (profile) => {
      let processedProfile = { ...profile, style: profile.style || 'single' };
      
      if (!processedProfile.image_url) return processedProfile;
      
      try {
        // Extract the path from the URL
        let path = '';
        if (processedProfile.image_url.includes('?token=')) {
          path = processedProfile.image_url.split('?token=')[0].split('/profile-images/')[1];
        } else if (processedProfile.image_url.includes('/public/profile-images/')) {
          path = processedProfile.image_url.split('/public/profile-images/')[1];
        } else if (processedProfile.image_url.includes('/sign/profile-images/')) {
          path = processedProfile.image_url.split('/sign/profile-images/')[1].split('?')[0];
        }
        
        if (path) {
          const { data } = await supabase.storage
            .from('profile-images')
            .createSignedUrl(path, 365 * 24 * 60 * 60);
          
          if (data?.signedUrl) {
            processedProfile = { ...processedProfile, image_url: data.signedUrl };
          }
        }
      } catch (error) {
        console.error(`Error refreshing signed URL for profile ${processedProfile.id}:`, error);
      }
      
      return processedProfile;
    }));

    return processedProfiles;
  };

  // Function to fetch profiles from server cache
  const fetchServerProfiles = async (userId: string): Promise<ChannelProfile[] | null> => {
    try {
      const response = await fetch(`/api/channel-profiles/${userId}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Server responded with ${response.status}`);
      }
      const data = await response.json();
      return data.profiles;
    } catch (err) {
      console.error('Error fetching server profiles:', err);
      return null;
    }
  };

  useEffect(() => {
    const loadProfiles = async () => {
      if (!user) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const userProfiles = await cacheService.getProfiles<ChannelProfile>(user.id);
        if (userProfiles) {
          setProfiles(userProfiles);
        }
      } catch (err) {
        console.error('Error loading profiles:', err);
        setError(err instanceof Error ? err.message : 'Unknown error loading profiles');
      }

      setLoading(false);
    };

    loadProfiles();
  }, [user]);

  const createProfile = async (profile: Omit<ChannelProfile, 'id' | 'user_id'>) => {
    if (!user) {
      setError('Cannot create profile: User not logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Ensure background_video_type is explicitly set
      const newProfile: ChannelProfile = {
        ...profile,
        id: crypto.randomUUID(),
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        background_video_type: profile.background_video_type || 'gameplay',
      };

      const updatedProfiles = [...profiles, newProfile];
      
      // Update local state immediately for better UX
      setProfiles(updatedProfiles);

      // Save to all caching layers
      await cacheService.saveProfiles(user.id, updatedProfiles);
    } catch (err) {
      console.error('Error creating profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error creating profile');
      
      // On error, try to reload profiles from cache
      try {
        const cachedProfiles = await cacheService.getProfiles<ChannelProfile>(user.id, { skipDatabase: true });
        if (cachedProfiles) {
          setProfiles(cachedProfiles);
        }
      } catch (cacheError) {
        console.error('Error loading cached profiles:', cacheError);
      }
    }

    setLoading(false);
  };

  const updateProfile = async (id: string, updates: Partial<ChannelProfile>) => {
    if (!user) {
      setError('Cannot update profile: User not logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Ensure background_video_type is explicitly included in updates
      const updatedProfiles = profiles.map(profile =>
        profile.id === id
          ? { 
              ...profile, 
              ...updates, 
              background_video_type: updates.background_video_type || profile.background_video_type || 'gameplay',
              updated_at: new Date().toISOString() 
            }
          : profile
      );

      // Update local state immediately for better UX
      setProfiles(updatedProfiles);

      // Save to all caching layers
      await cacheService.saveProfiles(user.id, updatedProfiles);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error updating profile');
      
      // On error, try to reload profiles from cache
      try {
        const cachedProfiles = await cacheService.getProfiles<ChannelProfile>(user.id, { skipDatabase: true });
        if (cachedProfiles) {
          setProfiles(cachedProfiles);
        }
      } catch (cacheError) {
        console.error('Error loading cached profiles:', cacheError);
      }
    }

    setLoading(false);
  };

  const deleteProfile = async (id: string) => {
    if (!user) {
      setError('Cannot delete profile: User not logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find the profile to delete
      const profileToDelete = profiles.find(profile => profile.id === id);
      if (!profileToDelete) {
        throw new Error('Profile not found');
      }

      // Delete profile image from storage if it exists
      if (profileToDelete.image_url) {
        try {
          // Extract the path from the URL
          let path = '';
          if (profileToDelete.image_url.includes('?token=')) {
            path = profileToDelete.image_url.split('?token=')[0].split('/profile-images/')[1];
          } else if (profileToDelete.image_url.includes('/public/profile-images/')) {
            path = profileToDelete.image_url.split('/public/profile-images/')[1];
          } else if (profileToDelete.image_url.includes('/sign/profile-images/')) {
            path = profileToDelete.image_url.split('/sign/profile-images/')[1].split('?')[0];
          }

          if (path) {
            const { error: storageError } = await supabase.storage
              .from('profile-images')
              .remove([path]);

            if (storageError) {
              console.error('Error deleting profile image:', storageError);
            }
          }
        } catch (imageError) {
          console.error('Error deleting profile image:', imageError);
        }
      }

      // Delete the profile from the database first
      const { error: deleteError } = await supabase
        .from('channel_profiles')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // If database delete was successful, update local state
      const updatedProfiles = profiles.filter(profile => profile.id !== id);
      setProfiles(updatedProfiles);

      // Update browser cache
      await cacheService.saveProfiles(user.id, updatedProfiles, { skipServer: true });
    } catch (err) {
      console.error('Error deleting profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error deleting profile');
      
      // On error, try to reload profiles from database
      try {
        const freshProfiles = await fetchProfilesFromDatabase(user.id);
        setProfiles(freshProfiles);
      } catch (refreshError) {
        console.error('Error refreshing profiles:', refreshError);
      }
    }

    setLoading(false);
  };

  const refreshProfiles = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);

    try {
      const freshProfiles = await fetchProfilesFromDatabase(user.id);
      setProfiles(freshProfiles);
      setCacheItem(PROFILES_CACHE_KEY, freshProfiles, user.id);
    } catch (err) {
      console.error('Error refreshing profiles:', err);
      setError(err instanceof Error ? err.message : 'Unknown error refreshing profiles');
    }

    setLoading(false);
  };

  const clearProfiles = () => {
    if (user) {
      removeCacheItem(PROFILES_CACHE_KEY, user.id);
    }
    setProfiles([]);
  };

  return (
    <ChannelProfileContext.Provider 
      value={{ 
        profiles, 
        loading, 
        error, 
        createProfile, 
        updateProfile, 
        deleteProfile, 
        refreshProfiles,
        clearProfiles
      }}
    >
      {children}
    </ChannelProfileContext.Provider>
  );
}; 