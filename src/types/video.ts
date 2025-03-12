export type VideoStatus = 'draft' | 'audio_processing' | 'audio_complete' | 'video_processing' | 'video_complete' | 'failed';

export interface VideoGenerationData {
  id: string;
  user_id: string;
  channel_id: string;
  channel_name: string;
  channel_nickname?: string;
  channel_image_url: string | null;
  hook_text: string;
  hook_audio_url: string | null;
  hook_audio_duration: number | null;
  script_text: string;
  script_audio_url: string | null;
  script_audio_duration: number | null;
  status: VideoStatus;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  video_url?: string | null;
  metadata?: {
    [key: string]: any;
  };
}

export interface Video {
  id: string;
  user_id: string;
  title: string;
  thumbnail_url: string;
  video_url: string;
  channel_name: string;
  created_at: string;
  duration: number;
  views: number;
  hook_text: string;
  script_text: string;
}

export interface VideoSort {
  column: 'created_at' | 'views' | 'channel_name';
  ascending: boolean;
}

export interface VideoPagination {
  page: number;
  pageSize: number;
} 