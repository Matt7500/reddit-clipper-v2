export interface ChannelProfile {
  id: string;
  user_id: string;
  name: string;
  nickname?: string;
  image_url: string | null;
  font: string;
  font_url?: string;
  voice_id?: string;
  style?: 'single' | 'grouped';
  has_background_music?: boolean;
  background_video_type?: 'gameplay' | 'satisfying';
  hook_animation_type?: 'fall' | 'float';
  audio_speed?: number;
  subtitle_size?: number;
  stroke_size?: number;
  pitch_up?: boolean;
  created_at: string;
  updated_at: string;
}
