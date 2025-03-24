import type { ChannelProfile } from "@/types/channel";

export interface VoiceModel {
  model_id: string;
  name: string;
  description: string;
  can_do_text_to_speech: boolean;
  languages: Array<{ language_id: string; name: string; }>;
}

export interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
}

export interface Font {
  name: string;
  url?: string;
  isDefault: boolean;
  family: string;
}

export const defaultFonts: Font[] = [
  { 
    name: "Inter", 
    family: "Inter", 
    isDefault: true,
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
  },
  { 
    name: "Roboto", 
    family: "Roboto", 
    isDefault: true,
    url: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap"
  },
  { 
    name: "Open Sans", 
    family: "Open Sans", 
    isDefault: true,
    url: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap"
  },
  { 
    name: "Montserrat", 
    family: "Montserrat", 
    isDefault: true,
    url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap"
  },
  { 
    name: "Poppins", 
    family: "Poppins", 
    isDefault: true,
    url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
  },
  { 
    name: "Jellee", 
    family: "Jellee", 
    isDefault: true,
    url: "https://ybykvsrrnkvsrbczhggb.supabase.co/storage/v1/object/public/default-fonts/Jellee.ttf"
  },
];

export const styles = [
  { value: 'single', label: 'Single' },
  { value: 'grouped', label: 'Grouped' },
] as const;

export type StyleOption = typeof styles[number]['value'];

export const backgroundVideoTypes = [
  { value: 'gameplay', label: 'Gameplay' },
  { value: 'satisfying', label: 'Satisfying' },
] as const;

export type BackgroundVideoType = typeof backgroundVideoTypes[number]['value'];

export const hookAnimationTypes = [
  { value: 'fall', label: 'Fall Animation' },
  { value: 'float', label: 'Float Animation' },
] as const;

export type HookAnimationType = typeof hookAnimationTypes[number]['value'];

export interface APIKeyErrors {
  openai: string;
  openrouter: string;
  elevenlabs: string;
}

export interface EditingKeys {
  openai: boolean;
  openrouter: boolean;
  elevenlabs: boolean;
} 