import { NextApiRequest, NextApiResponse } from 'next';
import { serverCache } from '@/lib/server-cache';
import { supabase } from '@/integrations/supabase/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { userId, ...settings } = req.body;

  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing userId'
    });
  }

  try {
    // Save to server cache first
    console.log('Saving settings to server cache:', settings);
    serverCache.setSettings(userId, settings);
    
    // Save to database
    console.log('Saving settings to database:', {
      user_id: userId,
      elevenlabs_api_key: settings.elevenlabsApiKey,
      elevenlabs_voice_model: settings.elevenlabsVoiceModel,
      openai_api_key: settings.openaiApiKey,
      openrouter_api_key: settings.openrouterApiKey,
      openrouter_model: settings.openrouterModel,
    });

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        elevenlabs_api_key: settings.elevenlabsApiKey,
        elevenlabs_voice_model: settings.elevenlabsVoiceModel,
        openai_api_key: settings.openaiApiKey,
        openrouter_api_key: settings.openrouterApiKey,
        openrouter_model: settings.openrouterModel,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: 'Settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 