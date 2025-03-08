import { NextApiRequest, NextApiResponse } from 'next';
import { serverCache } from '@/lib/server-cache';
import { supabase } from '@/integrations/supabase/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { userId, profiles } = req.body;

  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing userId'
    });
  }

  if (!Array.isArray(profiles)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Profiles must be an array'
    });
  }

  try {
    // Save to server cache first
    serverCache.setProfiles(userId, profiles);
    
    // Save to database
    // First delete existing profiles
    await supabase
      .from('channel_profiles')
      .delete()
      .eq('user_id', userId);

    // Then insert new profiles
    const { error } = await supabase
      .from('channel_profiles')
      .insert(
        profiles.map(profile => ({
          ...profile,
          user_id: userId,
          updated_at: new Date().toISOString()
        }))
      );

    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: 'Channel profiles saved successfully'
    });
  } catch (error) {
    console.error('Error saving channel profiles:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 