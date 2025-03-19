import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Upload, Plus, Pencil, Trash2, Key, Bot, Mic2, BrainCircuit, Users2, Check, Type, Music, User, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { ChannelProfile } from "@/types/channel";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useChannelProfiles } from "@/contexts/ChannelProfileContext";
import {
  APISettings,
  ChannelProfiles,
  CreateProfileDialog,
  DeleteProfileDialog,
  EditProfileDialog,
  FontSettings,
  GitHubUpdate,
  type Font,
  type VoiceModel,
  type Voice,
  type APIKeyErrors,
  type EditingKeys,
  type StyleOption,
  defaultFonts,
  styles
} from "./settings/index";

export const Settings = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { settings, loading: settingsLoading, saveSettings } = useUserSettings();
  const { 
    profiles, 
    loading: profilesLoading, 
    createProfile, 
    updateProfile, 
    deleteProfile 
  } = useChannelProfiles();

  const [customFonts, setCustomFonts] = useState<Font[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [channelImage, setChannelImage] = useState<string | null>(null);
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [profileToDeleteId, setProfileToDeleteId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<ChannelProfile | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileFont, setNewProfileFont] = useState(defaultFonts[0].name);
  const [newProfileVoiceId, setNewProfileVoiceId] = useState("");
  const [newProfileStyle, setNewProfileStyle] = useState<StyleOption>('single');
  const [newProfileBackgroundMusic, setNewProfileBackgroundMusic] = useState(false);
  
  const [openrouterModel, setOpenrouterModel] = useState(settings.openrouterModel || "");
  const [openrouterApiKey, setOpenrouterApiKey] = useState(settings.openrouterApiKey || "");
  const [localElevenlabsApiKey, setLocalElevenlabsApiKey] = useState(settings.elevenlabsApiKey || "");
  const [localElevenlabsVoiceModel, setLocalElevenlabsVoiceModel] = useState(settings.elevenlabsVoiceModel || "");
  const [localOpenaiApiKey, setLocalOpenaiApiKey] = useState(settings.openaiApiKey || "");
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [apiKeyErrors, setApiKeyErrors] = useState<APIKeyErrors>({
    openai: "",
    openrouter: "",
    elevenlabs: ""
  });
  const [editingKeys, setEditingKeys] = useState<EditingKeys>({
    openai: false,
    openrouter: false,
    elevenlabs: false
  });
  const [activeTab, setActiveTab] = useState("basic");

  // Effect to update local state when settings are loaded
  useEffect(() => {
    if (!settingsLoading && settings) {
      setOpenrouterModel(settings.openrouterModel || "");
      setOpenrouterApiKey(settings.openrouterApiKey || "");
      setLocalElevenlabsApiKey(settings.elevenlabsApiKey || "");
      setLocalElevenlabsVoiceModel(settings.elevenlabsVoiceModel || "");
      setLocalOpenaiApiKey(settings.openaiApiKey || "");
      setApiKeyErrors({
        openai: "",
        openrouter: "",
        elevenlabs: ""
      });
    }
  }, [settings, settingsLoading]);

  // Function to fetch voice models from ElevenLabs
  const fetchVoiceModels = async () => {
    if (!localElevenlabsApiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your ElevenLabs API key first.",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setLoadingModels(true);
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/models', {
        headers: {
          'Accept': 'application/json',
          'xi-api-key': localElevenlabsApiKey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch voice models');
      }

      const data = await response.json();
      const ttsModels = data.filter((model: VoiceModel) => model.can_do_text_to_speech);
      setVoiceModels(ttsModels);

      if (!localElevenlabsVoiceModel && ttsModels.length > 0) {
        setLocalElevenlabsVoiceModel(ttsModels[0].model_id);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch voice models. Please check your API key.",
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoadingModels(false);
    }
  };

  // Effect to fetch models when API key changes
  useEffect(() => {
    if (localElevenlabsApiKey) {
      fetchVoiceModels();
    }
  }, [localElevenlabsApiKey]);

  // Function to fetch voices from ElevenLabs
  const fetchVoices = async () => {
    if (!localElevenlabsApiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your ElevenLabs API key first.",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setLoadingVoices(true);
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'Accept': 'application/json',
          'xi-api-key': localElevenlabsApiKey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }

      const data = await response.json();
      setVoices(data.voices);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch voices. Please check your API key.",
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoadingVoices(false);
    }
  };

  // Effect to fetch voices when API key changes
  useEffect(() => {
    if (localElevenlabsApiKey) {
      fetchVoices();
    }
  }, [localElevenlabsApiKey]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const fileName = `${crypto.randomUUID()}.${file.name.split('.').pop()}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = await supabase.storage
        .from('profile-images')
        .createSignedUrl(filePath, 365 * 24 * 60 * 60);

      if (!data?.signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      setChannelImage(data.signedUrl);
    } catch (error: any) {
      toast({
        title: "Error uploading image",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleEditProfile = async (profile: ChannelProfile) => {
    setEditingProfile(profile);
    setChannelImage(profile.image_url);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingProfile) return;

    try {
      console.log('Saving profile with background_video_type:', editingProfile.background_video_type);
      const selectedFont = allFonts.find(f => f.name === editingProfile.font);
      await updateProfile(editingProfile.id, {
        name: editingProfile.name,
        nickname: editingProfile.nickname,
        image_url: channelImage,
        font: editingProfile.font,
        font_url: selectedFont?.url || null,
        voice_id: editingProfile.voice_id,
        style: editingProfile.style,
        has_background_music: editingProfile.has_background_music,
        background_video_type: editingProfile.background_video_type,
        target_duration: editingProfile.target_duration,
        subtitle_size: editingProfile.subtitle_size !== undefined && editingProfile.subtitle_size !== null 
          ? editingProfile.subtitle_size 
          : 64,
        stroke_size: editingProfile.stroke_size !== undefined && editingProfile.stroke_size !== null 
          ? editingProfile.stroke_size 
          : 8,
        pitch_up: editingProfile.pitch_up
      });

      setIsEditDialogOpen(false);
      setEditingProfile(null);
      setChannelImage(null);
      
      toast({
        title: "Profile updated",
        description: "The channel profile has been updated successfully.",
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Error updating profile",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await deleteProfile(id);
      setIsDeleteDialogOpen(false);
      setProfileToDeleteId(null);

      toast({
        title: "Profile deleted",
        description: "The channel profile has been deleted.",
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Error deleting profile",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleCreateProfile = async (data: {
    name: string;
    image_url: string | null;
    font: string;
    voice_id?: string;
    style: 'single' | 'grouped';
    has_background_music: boolean;
    background_video_type: 'gameplay' | 'satisfying';
    target_duration: number;
    subtitle_size: number;
    stroke_size: number;
    pitch_up: boolean;
  }) => {
    try {
      const selectedFont = allFonts.find(f => f.name === data.font);
      await createProfile({
        ...data,
        font_url: selectedFont?.url || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      setIsDialogOpen(false);
      setChannelImage(null);
      
      toast({
        title: "Profile created",
        description: "Your channel profile has been created successfully.",
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Error creating profile",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await saveSettings({
        openrouterApiKey,
        openrouterModel,
        elevenlabsApiKey: localElevenlabsApiKey,
        elevenlabsVoiceModel: localElevenlabsVoiceModel,
        openaiApiKey: localOpenaiApiKey
      });

      setApiKeyErrors({
        openai: "",
        openrouter: "",
        elevenlabs: ""
      });

      setEditingKeys({
        openai: false,
        openrouter: false,
        elevenlabs: false
      });

      toast({
        title: "Settings saved",
        description: "Your settings have been saved successfully.",
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const validateOpenAIKey = (key: string) => {
    if (!key) return "";
    const regex = /^sk-proj-[a-zA-Z0-9_]{156}$/;
    return regex.test(key) ? "" : "Invalid OpenAI API key format. Should start with 'sk-proj-' followed by 156 characters.";
  };

  const validateOpenRouterKey = (key: string) => {
    if (!key) return "";
    const regex = /^sk-or-v1-[a-f0-9]{64}$/;
    return regex.test(key) ? "" : "Invalid OpenRouter API key format. Should start with 'sk-or-v1-' followed by 64 characters.";
  };

  const validateElevenLabsKey = (key: string) => {
    if (!key) return "";
    const regex = /^sk_[a-f0-9]{48}$/;
    return regex.test(key) ? "" : "Invalid ElevenLabs API key format. Should start with 'sk_' followed by 48 characters.";
  };

  const handleOpenAIKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalOpenaiApiKey(value);
    setEditingKeys(prev => ({ ...prev, openai: true }));
    if (value) {
      setApiKeyErrors(prev => ({ ...prev, openai: validateOpenAIKey(value) }));
    } else {
      setApiKeyErrors(prev => ({ ...prev, openai: "" }));
    }
  };

  const handleOpenRouterKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOpenrouterApiKey(value);
    setEditingKeys(prev => ({ ...prev, openrouter: true }));
    if (value) {
      setApiKeyErrors(prev => ({ ...prev, openrouter: validateOpenRouterKey(value) }));
    } else {
      setApiKeyErrors(prev => ({ ...prev, openrouter: "" }));
    }
  };

  const handleElevenLabsKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalElevenlabsApiKey(value);
    setEditingKeys(prev => ({ ...prev, elevenlabs: true }));
    if (value) {
      setApiKeyErrors(prev => ({ ...prev, elevenlabs: validateElevenLabsKey(value) }));
    } else {
      setApiKeyErrors(prev => ({ ...prev, elevenlabs: "" }));
    }
  };

  // Function to validate font file
  const validateFontFile = (file: File) => {
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    return validExtensions.includes(extension);
  };

  // Function to handle font upload
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!validateFontFile(file)) {
      toast({
        title: "Invalid font file",
        description: "Please upload a valid font file (.ttf, .otf, .woff, or .woff2)",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setLoadingFonts(true);
    try {
      const fileName = `${crypto.randomUUID()}-${file.name}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('fonts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = await supabase.storage
        .from('fonts')
        .createSignedUrl(filePath, 365 * 24 * 60 * 60);

      if (!data?.signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      const newFont: Font = {
        name: file.name.split('.')[0],
        url: data.signedUrl,
        isDefault: false,
        family: file.name.split('.')[0]
      };

      setCustomFonts(prev => [...prev, newFont]);
      loadCustomFont(newFont);

      toast({
        title: "Font uploaded",
        description: "Your custom font has been uploaded successfully.",
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Error uploading font",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoadingFonts(false);
    }
  };

  // Function to load a font using @font-face
  const loadCustomFont = (font: Font) => {
    if (!font.url) return;
    
    // Check if it's a Google Fonts URL
    if (font.url.includes('fonts.googleapis.com')) {
      // For Google Fonts, we need to add a link element
      const linkId = `font-${font.name}`;
      
      // Check if the link already exists
      if (document.getElementById(linkId)) return;
      
      const link = document.createElement('link');
      link.href = font.url;
      link.rel = 'stylesheet';
      link.id = linkId;
      
      document.head.appendChild(link);
      return;
    }
    
    // For direct font files
    try {
      // Create a style element for the @font-face declaration
      const styleId = `font-face-${font.name}`;
      
      // Check if the style already exists
      if (document.getElementById(styleId)) return;
      
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @font-face {
          font-family: '${font.family}';
          src: url('${font.url}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
      `;
      
      document.head.appendChild(style);
      
      // Also load the font using FontFace API for better browser support
      const fontFace = new FontFace(font.family, `url(${font.url})`);
      fontFace.load().then((loadedFont) => {
        // @ts-ignore - TypeScript doesn't recognize the add method but it exists
        document.fonts.add(loadedFont);
      }).catch((error) => {
        console.error(`Error loading font ${font.name}:`, error);
        toast({
          title: "Error loading font",
          description: `Failed to load font ${font.name}`,
          variant: "destructive",
          duration: 2000,
        });
      });
    } catch (error) {
      console.error(`Error creating FontFace for ${font.name}:`, error);
    }
  };

  // Function to load custom fonts from storage
  const loadCustomFonts = async () => {
    if (!user) return;

    setLoadingFonts(true);
    try {
      const { data: files, error } = await supabase.storage
        .from('fonts')
        .list(`${user.id}/`);

      if (error) throw error;

      const fonts: Font[] = [];
      for (const file of files) {
        const { data } = await supabase.storage
          .from('fonts')
          .createSignedUrl(`${user.id}/${file.name}`, 365 * 24 * 60 * 60);

        if (data?.signedUrl) {
          // Extract just the original filename without the UUID
          // The format is: UUID-originalFilename.extension
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
          const fontName = file.name.replace(uuidPattern, '').split('.')[0];
          
          const font = {
            name: fontName,
            url: data.signedUrl,
            isDefault: false,
            family: fontName
          };
          fonts.push(font);
          loadCustomFont(font);
        }
      }

      setCustomFonts(fonts);
    } catch (error: any) {
      toast({
        title: "Error loading fonts",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoadingFonts(false);
    }
  };

  // Load custom fonts on component mount
  useEffect(() => {
    if (user) {
      loadCustomFonts();
    }
  }, [user]);

  // Function to delete a font
  const handleDeleteFont = async (fontName: string) => {
    if (!user) return;

    try {
      const { data: files, error: listError } = await supabase.storage
        .from('fonts')
        .list(`${user.id}/`);

      if (listError) throw listError;

      const fontFile = files.find(file => file.name.includes(fontName));
      if (!fontFile) {
        throw new Error('Font file not found');
      }

      const { error: deleteError } = await supabase.storage
        .from('fonts')
        .remove([`${user.id}/${fontFile.name}`]);

      if (deleteError) throw deleteError;

      setCustomFonts(prev => prev.filter(font => font.name !== fontName));

      toast({
        title: "Font deleted",
        description: "The font has been removed successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error deleting font",
        description: error.message,
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  // Add this function to load default fonts
  const loadDefaultFonts = async () => {
    const loadPromises = defaultFonts
      .filter(font => font.url)
      .map(font => loadCustomFont(font));
    
    await Promise.all(loadPromises);
  };

  // Add this effect to load default fonts on mount
  useEffect(() => {
    loadDefaultFonts();
  }, []);

  const allFonts = [...defaultFonts, ...customFonts];

  // Add preload images effect
  useEffect(() => {
    if (!profiles) return;

    // Reset image load errors when profiles change
    setImageLoadErrors({});

    // Preload all profile images
    profiles.forEach(profile => {
      if (profile.image_url) {
        const img = new Image();
        img.src = profile.image_url;
        img.onload = () => {
          setImageLoadErrors(prev => ({
            ...prev,
            [profile.id]: false
          }));
        };
        img.onerror = () => {
          setImageLoadErrors(prev => ({
            ...prev,
            [profile.id]: true
          }));
        };
      }
    });
  }, [profiles]);

  return (
    <Card className="w-full p-6 backdrop-blur-lg bg-[#F1F1F1]/10">
      <div className="space-y-8">
        <ChannelProfiles
          profiles={profiles}
          profilesLoading={profilesLoading}
          imageLoadErrors={imageLoadErrors}
          onEditProfile={handleEditProfile}
          onDeleteProfile={(id) => {
            setProfileToDeleteId(id);
            setIsDeleteDialogOpen(true);
          }}
          onCreateProfile={() => {
            setChannelImage(null);
            setIsDialogOpen(true);
          }}
        />

        <APISettings
          openrouterModel={openrouterModel}
          openrouterApiKey={openrouterApiKey}
          elevenlabsApiKey={localElevenlabsApiKey}
          elevenlabsVoiceModel={localElevenlabsVoiceModel}
          openaiApiKey={localOpenaiApiKey}
          voiceModels={voiceModels}
          loadingModels={loadingModels}
          apiKeyErrors={apiKeyErrors}
          editingKeys={editingKeys}
          isSaving={isSaving}
          onOpenAIKeyChange={handleOpenAIKeyChange}
          onOpenRouterKeyChange={handleOpenRouterKeyChange}
          onElevenLabsKeyChange={handleElevenLabsKeyChange}
          onOpenRouterModelChange={setOpenrouterModel}
          onElevenLabsVoiceModelChange={setLocalElevenlabsVoiceModel}
          onSaveSettings={handleSaveSettings}
        />

        <FontSettings
          customFonts={customFonts}
          loadingFonts={loadingFonts}
          onFontUpload={handleFontUpload}
          onDeleteFont={handleDeleteFont}
        />
        
        <GitHubUpdate />
      </div>

      <EditProfileDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        editingProfile={editingProfile}
        onSaveEdit={handleSaveEdit}
        channelImage={channelImage}
        onImageUpload={handleImageUpload}
        customFonts={customFonts}
        voices={voices}
        loadingVoices={loadingVoices}
        onEditingProfileChange={setEditingProfile}
      />

      <DeleteProfileDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        profileToDelete={profiles.find(p => p.id === profileToDeleteId) || null}
        onConfirmDelete={() => profileToDeleteId && handleDeleteProfile(profileToDeleteId)}
        imageLoadErrors={imageLoadErrors}
      />

      <CreateProfileDialog
        isOpen={isDialogOpen}
        onOpenChange={(open) => {
          // Store current scroll position
          const scrollPos = window.scrollY;
          setIsDialogOpen(open);
          // Restore scroll position after state update
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollPos);
          });
        }}
        onCreateProfile={(data) => handleCreateProfile(data)}
        channelImage={channelImage}
        onImageUpload={handleImageUpload}
        customFonts={customFonts}
        voices={voices}
        loadingVoices={loadingVoices}
      />
    </Card>
  );
};
