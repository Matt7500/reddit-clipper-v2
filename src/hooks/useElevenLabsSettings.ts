import { useUserSettings } from "@/contexts/UserSettingsContext";

/**
 * Custom hook to access and manage ElevenLabs API settings
 * 
 * @returns {Object} ElevenLabs settings and functions to manage them
 */
export function useElevenLabsSettings() {
  const { settings, loading, error, saveSettings } = useUserSettings();

  // Get the ElevenLabs API key
  const apiKey = settings.elevenlabsApiKey;
  
  // Get the ElevenLabs voice model
  const voiceModel = settings.elevenlabsVoiceModel;

  // Save ElevenLabs API key
  const saveApiKey = async (newApiKey: string) => {
    await saveSettings({ elevenlabsApiKey: newApiKey });
  };

  // Save ElevenLabs voice model
  const saveVoiceModel = async (newVoiceModel: string) => {
    await saveSettings({ elevenlabsVoiceModel: newVoiceModel });
  };

  // Save both API key and voice model
  const saveElevenLabsSettings = async (newApiKey: string, newVoiceModel: string) => {
    await saveSettings({
      elevenlabsApiKey: newApiKey,
      elevenlabsVoiceModel: newVoiceModel
    });
  };

  return {
    apiKey,
    voiceModel,
    saveApiKey,
    saveVoiceModel,
    saveElevenLabsSettings,
    loading,
    error
  };
}