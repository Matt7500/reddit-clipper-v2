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
        const profiles = serverCache.getProfiles(userId);
        
        if (profiles) {
          return res.json({ 
            success: true, 
            profiles,
            source: 'server-cache'
          });
        }

        // If not in cache, try database
        const { data, error } = await supabase
          .from('channel_profiles')
          .select('*')
          .eq('user_id', userId);

        if (error) throw error;

        if (data) {
          // Update server cache
          serverCache.setProfiles(userId, data);

          return res.json({ 
            success: true, 
            profiles: data,
            source: 'database'
          });
        }

        return res.status(404).json({ 
          success: false, 
          error: 'Profiles not found'
        });
      } catch (error) {
        console.error('Error retrieving channel profiles:', error);
        return res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    case 'DELETE':
      try {
        serverCache.deleteProfiles(userId);
        return res.json({ 
          success: true, 
          message: 'Profiles cleared from server cache'
        });
      } catch (error) {
        console.error('Error clearing channel profiles:', error);
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