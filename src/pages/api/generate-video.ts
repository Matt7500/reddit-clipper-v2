import { NextApiRequest, NextApiResponse } from 'next';
import { userSettingsCache } from '@/lib/server-cache';
import { supabase } from '@/integrations/supabase/client';

async function getUserSettings(userId: string, clientSettings?: any) {
  // First try to use client-provided settings (from browser cache)
  if (clientSettings) {
    // Update server cache with client settings
    userSettingsCache.set(userId, clientSettings);
    return clientSettings;
  }

  // Then try server cache
  const cachedSettings = userSettingsCache.get(userId);
  if (cachedSettings) {
    return cachedSettings;
  }

  // If not in cache, try to get from database
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching user settings from database:', error);
    return null;
  }

  if (data) {
    // Transform database data to settings format
    const settings = {
      elevenlabsApiKey: data.elevenlabs_api_key,
      elevenlabsVoiceModel: data.elevenlabs_voice_model,
      openaiApiKey: data.openai_api_key,
      openrouterApiKey: data.openrouter_api_key,
      openrouterModel: data.openrouter_model,
      ...data.other_settings,
    };

    // Cache the settings
    userSettingsCache.set(userId, settings);
    return settings;
  }

  return null;
}

async function generateAudio(text: string, apiKey: string, voiceId: string, modelId: string) {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  return response;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { 
      hook, 
      script, 
      elevenlabsApiKey, 
      elevenlabsVoiceModel,
      userId,
      channelId,
      channelName,
      channelImageUrl,
      channelVoiceId,
      channelFont,
      channelStyle,
      useUserSettings = true,
      cachedSettings,
      subtitle_size = 64,
      stroke_size = 8,
      has_background_music = false
    } = req.body;

    console.log('Received request with userId:', userId);
    console.log('useUserSettings:', useUserSettings);
    console.log('Channel subtitle size:', subtitle_size);
    console.log('Channel stroke size:', stroke_size);
    console.log('Channel has background music:', has_background_music);

    // Check if we should use cached settings and if userId is provided
    let finalElevenlabsApiKey = elevenlabsApiKey;
    let finalElevenlabsVoiceModel = elevenlabsVoiceModel;
    let finalOpenaiApiKey = null;
    
    if (useUserSettings && userId) {
      console.log(`Attempting to use settings for user: ${userId}`);
      const userSettings = await getUserSettings(userId, cachedSettings);
      
      if (!userSettings) {
        return res.status(400).json({
          success: false,
          error: 'User settings not found. Please configure your API keys in the settings.'
        });
      }

      finalElevenlabsApiKey = userSettings.elevenlabsApiKey || finalElevenlabsApiKey;
      finalElevenlabsVoiceModel = userSettings.elevenlabsVoiceModel || finalElevenlabsVoiceModel;
      finalOpenaiApiKey = userSettings.openaiApiKey;
      
      console.log('Successfully loaded user settings');
    }

    if (!hook || !script || !finalElevenlabsApiKey || !channelVoiceId || !finalElevenlabsVoiceModel) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters. Please provide hook, script, ElevenLabs API key, channel voice ID, and voice model.' 
      });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Generate hook audio
    console.log('Generating hook audio...');
    const hookAudioResponse = await generateAudio(
      hook,
      finalElevenlabsApiKey,
      channelVoiceId,
      finalElevenlabsVoiceModel
    );

    // Generate script audio
    console.log('Generating script audio...');
    const scriptAudioResponse = await generateAudio(
      script,
      finalElevenlabsApiKey,
      channelVoiceId,
      finalElevenlabsVoiceModel
    );

    // Get audio data
    const hookAudioBuffer = await hookAudioResponse.arrayBuffer();
    const scriptAudioBuffer = await scriptAudioResponse.arrayBuffer();

    // Upload audio files to Supabase storage
    const hookFileName = `${userId}/${channelId}/${Date.now()}_hook.mp3`;
    const scriptFileName = `${userId}/${channelId}/${Date.now()}_script.mp3`;

    const { data: hookData, error: hookError } = await supabase.storage
      .from('audio-files')
      .upload(hookFileName, hookAudioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      });

    if (hookError) throw hookError;

    const { data: scriptData, error: scriptError } = await supabase.storage
      .from('audio-files')
      .upload(scriptFileName, scriptAudioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      });

    if (scriptError) throw scriptError;

    // Get public URLs for the audio files
    const { data: hookUrl } = await supabase.storage
      .from('audio-files')
      .getPublicUrl(hookFileName);

    const { data: scriptUrl } = await supabase.storage
      .from('audio-files')
      .getPublicUrl(scriptFileName);

    res.json({
      success: true,
      data: {
        hookAudioUrl: hookUrl.publicUrl,
        scriptAudioUrl: scriptUrl.publicUrl,
        hookAudioDuration: 0, // You might want to calculate this
        scriptAudioDuration: 0, // You might want to calculate this
        subtitle_size,
        stroke_size,
        has_background_music
      }
    });
  } catch (error) {
    console.error('Error in video generation:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error in video generation'
    });
  }
} 