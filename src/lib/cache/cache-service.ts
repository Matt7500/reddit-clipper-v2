import { idbCache } from './idb';
import { supabase } from '@/integrations/supabase/client';

export interface CacheOptions {
  skipBrowser?: boolean;
  skipServer?: boolean;
  skipDatabase?: boolean;
}

class CacheService {
  // Use the correct API URL with port 8080
  private readonly API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  // Settings Cache Methods
  async getSettings<T>(userId: string, options: CacheOptions = {}): Promise<T | null> {
    // Try browser cache first (IndexedDB)
    if (!options.skipBrowser) {
      const browserCache = await idbCache.get<T>('settings', 'user_settings', userId);
      if (browserCache) {
        console.log('Retrieved settings from browser cache');
        return browserCache;
      }
    }

    // Try database directly (skip server cache)
    if (!options.skipDatabase) {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error) throw error;

        if (data) {
          console.log('Retrieved settings from database');
          const settings = {
            elevenlabsApiKey: data.elevenlabs_api_key,
            elevenlabsVoiceModel: data.elevenlabs_voice_model,
            openaiApiKey: data.openai_api_key,
            openrouterApiKey: data.openrouter_api_key,
            openrouterModel: data.openrouter_model,
            ...data.other_settings,
          } as T;

          // Update browser cache
          if (!options.skipBrowser) {
            await idbCache.set('settings', 'user_settings', settings, userId);
          }

          return settings;
        }
      } catch (error) {
        console.error('Error fetching from database:', error);
      }
    }

    return null;
  }

  async saveSettings<T>(userId: string, settings: T, options: CacheOptions = {}): Promise<void> {
    // Update browser cache
    if (!options.skipBrowser) {
      await idbCache.set('settings', 'user_settings', settings, userId);
    }

    // Update database directly (skip server cache)
    if (!options.skipDatabase) {
      try {
        const { error } = await supabase
          .from('user_settings')
          .upsert({
            user_id: userId,
            elevenlabs_api_key: (settings as any).elevenlabsApiKey,
            elevenlabs_voice_model: (settings as any).elevenlabsVoiceModel,
            openai_api_key: (settings as any).openaiApiKey,
            openrouter_api_key: (settings as any).openrouterApiKey,
            openrouter_model: (settings as any).openrouterModel,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          });

        if (error) throw error;
      } catch (error) {
        console.error('Error saving to database:', error);
        throw error;
      }
    }
  }

  async clearSettings(userId: string, options: CacheOptions = {}): Promise<void> {
    if (!options.skipBrowser) {
      await idbCache.delete('settings', 'user_settings', userId);
    }
  }

  // Channel Profiles Cache Methods
  async getProfiles<T>(userId: string, options: CacheOptions = {}): Promise<T[] | null> {
    // Try browser cache first
    if (!options.skipBrowser) {
      const browserCache = await idbCache.get<T[]>('profiles', 'channel_profiles', userId);
      if (browserCache) {
        console.log('Retrieved profiles from browser cache');
        return browserCache;
      }
    }

    // Try database directly (skip server cache)
    if (!options.skipDatabase) {
      try {
        const { data, error } = await supabase
          .from('channel_profiles')
          .select('*')
          .eq('user_id', userId);

        if (error) throw error;

        if (data) {
          console.log('Retrieved profiles from database');
          const profiles = data as T[];

          // Update browser cache
          if (!options.skipBrowser) {
            await idbCache.set('profiles', 'channel_profiles', profiles, userId);
          }

          return profiles;
        }
      } catch (error) {
        console.error('Error fetching from database:', error);
      }
    }

    return null;
  }

  async saveProfiles<T>(userId: string, profiles: T[], options: CacheOptions = {}): Promise<void> {
    // Update browser cache
    if (!options.skipBrowser) {
      await idbCache.set('profiles', 'channel_profiles', profiles, userId);
    }

    // Update database directly (skip server cache)
    if (!options.skipDatabase) {
      try {
        // First delete existing profiles
        await supabase
          .from('channel_profiles')
          .delete()
          .eq('user_id', userId);

        // Debug: Log profiles before saving
        console.log('Profiles before saving:', JSON.stringify(profiles, null, 2));
        
        // Then insert new profiles
        const profilesToInsert = profiles.map(profile => {
          // Debug: Log each profile's background_video_type
          console.log('Profile background_video_type:', (profile as any).background_video_type);
          
          // Ensure all required fields are explicitly included
          const profileData = {
            ...profile,
            user_id: userId,
            updated_at: new Date().toISOString(),
            // Ensure background_video_type is explicitly set
            background_video_type: (profile as any).background_video_type || 'gameplay'
          };
          
          // Debug: Log the final profile data
          console.log('Final profile data:', JSON.stringify(profileData, null, 2));
          
          return profileData;
        });
        
        const { error } = await supabase
          .from('channel_profiles')
          .insert(profilesToInsert);

        if (error) {
          console.error('Supabase insert error:', error);
          throw error;
        }
      } catch (error) {
        console.error('Error saving to database:', error);
        throw error;
      }
    }
  }

  async clearProfiles(userId: string, options: CacheOptions = {}): Promise<void> {
    if (!options.skipBrowser) {
      await idbCache.delete('profiles', 'channel_profiles', userId);
    }
  }

  // Helper method to update server cache
  private async updateServerCache(userId: string, data: any): Promise<void> {
    try {
      // Determine the correct endpoint based on the data structure
      const endpoint = data.profiles ? '/api/save-channel-profiles' : '/api/save-user-settings';
      
      await fetch(`${this.API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...data })
      });
    } catch (error) {
      console.error('Error updating server cache:', error);
    }
  }
}

export const cacheService = new CacheService(); 