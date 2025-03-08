import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { cacheService } from "@/lib/cache/cache-service";

// Define the user settings interface
interface UserSettings {
  elevenlabsApiKey?: string;
  elevenlabsVoiceModel?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  [key: string]: any; // Allow for additional settings
}

interface UserSettingsContextType {
  settings: UserSettings;
  loading: boolean;
  error: string | null;
  saveSettings: (settings: Partial<UserSettings>) => Promise<void>;
  clearSettings: () => void;
}

// Create the context with default values
const UserSettingsContext = createContext<UserSettingsContextType>({
  settings: {},
  loading: true,
  error: null,
  saveSettings: async () => {},
  clearSettings: () => {},
});

export const UserSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings when user changes
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setSettings({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const userSettings = await cacheService.getSettings<UserSettings>(user.id);
        if (userSettings) {
          setSettings(userSettings);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
        setError(err instanceof Error ? err.message : 'Unknown error loading settings');
      }

      setLoading(false);
    };

    loadSettings();
  }, [user]);

  // Save settings
  const saveSettings = async (newSettings: Partial<UserSettings>) => {
    if (!user) {
      setError('Cannot save settings: User not logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updatedSettings = {
        ...settings,
        ...newSettings,
      };

      // Update local state immediately for better UX
      setSettings(updatedSettings);

      // Save to all caching layers
      await cacheService.saveSettings(user.id, updatedSettings);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err instanceof Error ? err.message : 'Unknown error saving settings');
      
      // On error, try to reload settings from cache
      try {
        const cachedSettings = await cacheService.getSettings<UserSettings>(user.id, { skipDatabase: true });
        if (cachedSettings) {
          setSettings(cachedSettings);
        }
      } catch (cacheError) {
        console.error('Error loading cached settings:', cacheError);
      }
    }

    setLoading(false);
  };

  // Clear settings
  const clearSettings = async () => {
    if (user) {
      await cacheService.clearSettings(user.id);
    }
    setSettings({});
  };

  return (
    <UserSettingsContext.Provider value={{ settings, loading, error, saveSettings, clearSettings }}>
      {children}
    </UserSettingsContext.Provider>
  );
};

export const useUserSettings = () => useContext(UserSettingsContext); 