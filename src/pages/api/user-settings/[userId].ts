import { NextApiRequest, NextApiResponse } from 'next';
import { serverCache } from '@/lib/server-cache';
import { supabase } from '@/integrations/supabase/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing or invalid userId'
    });
  }

  switch (req.method) {
    case 'GET':
      try {
        // Try server cache first
        const settings = serverCache.getSettings(userId);
        
        if (settings) {
          return res.json({ 
            success: true, 
            settings,
            source: 'server-cache'
          });
        }

        // If not in cache, try database
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error) throw error;

        if (data) {
          const settings = {
            elevenlabsApiKey: data.elevenlabs_api_key,
            elevenlabsVoiceModel: data.elevenlabs_voice_model,
            openaiApiKey: data.openai_api_key,
            openrouterApiKey: data.openrouter_api_key,
            openrouterModel: data.openrouter_model,
            ...data.other_settings,
          };

          // Update server cache
          serverCache.setSettings(userId, settings);

          return res.json({ 
            success: true, 
            settings,
            source: 'database'
          });
        }

        return res.status(404).json({ 
          success: false, 
          error: 'Settings not found'
        });
      } catch (error) {
        console.error('Error retrieving user settings:', error);
        return res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    case 'DELETE':
      try {
        serverCache.deleteSettings(userId);
        return res.json({ 
          success: true, 
          message: 'Settings cleared from server cache'
        });
      } catch (error) {
        console.error('Error clearing user settings:', error);
        return res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    default:
      return res.status(405).json({ 
        success: false, 
        error: 'Method not allowed'
      });
  }
} 