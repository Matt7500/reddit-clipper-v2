import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, User, Palette, Music } from "lucide-react";
import { useState, useEffect } from "react";
import type { Font, StyleOption, Voice, BackgroundVideoType } from "./types";
import { defaultFonts, styles, backgroundVideoTypes } from "./types";
import type { ChannelProfile } from "@/types/channel";

interface EditProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingProfile: ChannelProfile | null;
  onSaveEdit: () => Promise<void>;
  channelImage: string | null;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  customFonts: Font[];
  voices: Voice[];
  loadingVoices: boolean;
  onEditingProfileChange: (profile: ChannelProfile | null) => void;
}

export const EditProfileDialog = ({
  isOpen,
  onOpenChange,
  editingProfile,
  onSaveEdit,
  channelImage,
  onImageUpload,
  customFonts,
  voices,
  loadingVoices,
  onEditingProfileChange,
}: EditProfileDialogProps) => {
  const [activeTab, setActiveTab] = useState("basic");
  const allFonts = [...defaultFonts, ...customFonts];
  const [subtitleSizeInput, setSubtitleSizeInput] = useState<string>("");
  const [strokeSizeInput, setStrokeSizeInput] = useState<string>("");

  // Only reset active tab when dialog first opens
  useEffect(() => {
    if (isOpen) {
      // Only set default tab when dialog first opens, not on every state change
      // Don't reset the tab if it's already set to something other than "basic"
      
      // Ensure subtitle_size and stroke_size have default values
      if (editingProfile && (editingProfile.subtitle_size === undefined || editingProfile.subtitle_size === null)) {
        onEditingProfileChange({
          ...editingProfile,
          subtitle_size: 64
        });
      }
      
      if (editingProfile && (editingProfile.stroke_size === undefined || editingProfile.stroke_size === null)) {
        onEditingProfileChange({
          ...editingProfile,
          stroke_size: 8
        });
      }
    }
  }, [isOpen, editingProfile, onEditingProfileChange]);

  // Initialize input fields when profile changes
  useEffect(() => {
    if (editingProfile) {
      setSubtitleSizeInput(editingProfile.subtitle_size?.toString() || "64");
      setStrokeSizeInput(editingProfile.stroke_size?.toString() || "8");
    }
  }, [editingProfile?.id]);

  if (!editingProfile) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#222222] text-white border border-white/10 flex flex-col h-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Channel Profile</DialogTitle>
        </DialogHeader>

        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab} 
          className="flex-1 flex flex-col"
        >
          <TabsList className="grid grid-cols-3 bg-[#2A2A2A] h-[72px]">
            <TabsTrigger value="basic" className="data-[state=active]:bg-primary flex flex-col items-center gap-1 px-0">
              <div className="flex flex-col items-center gap-1">
                <User className="w-4 h-4" />
                <span className="text-xs whitespace-nowrap">Basic</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="data-[state=active]:bg-primary flex flex-col items-center gap-1 px-0">
              <div className="flex flex-col items-center gap-1">
                <Palette className="w-4 h-4" />
                <span className="text-xs whitespace-nowrap">Style</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="audio" className="data-[state=active]:bg-primary flex flex-col items-center gap-1 px-0">
              <div className="flex flex-col items-center gap-1">
                <Music className="w-4 h-4" />
                <span className="text-xs whitespace-nowrap">Audio & Voice</span>
              </div>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 py-4">
            <TabsContent value="basic" className="space-y-4 h-full">
              <div className="space-y-4">
                <h3 className="font-medium text-white">Basic Information</h3>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Channel Image</label>
                  <div className="flex items-center gap-4">
                    {channelImage && (
                      <div className="w-16 h-16 rounded-full overflow-hidden border border-white/10">
                        <img 
                          src={channelImage} 
                          alt="Channel" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="cursor-pointer">
                        <Input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={onImageUpload}
                        />
                        <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-white/10 bg-[#2A2A2A] hover:bg-[#333333] transition-colors">
                          <Upload className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Upload Image</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Channel Name</label>
                  <Input 
                    type="text"
                    placeholder="Enter your channel name"
                    value={editingProfile.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEditingProfileChange({ ...editingProfile, name: e.target.value })}
                    className="bg-[#2A2A2A] border-[#3A3A3A]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Target Duration (seconds)</label>
                  <Input 
                    type="number"
                    min={1}
                    max={600}
                    placeholder="Enter target video duration"
                    value={editingProfile.target_duration || 60}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEditingProfileChange({ 
                      ...editingProfile, 
                      target_duration: Math.max(1, Math.min(600, parseInt(e.target.value) || 60)) 
                    })}
                    className="bg-[#2A2A2A] border-[#3A3A3A]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 h-full">
              <div className="space-y-4">
                <h3 className="font-medium text-white">Appearance</h3>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Font</label>
                  <Select 
                    value={editingProfile.font} 
                    onValueChange={(value: string) => onEditingProfileChange({ ...editingProfile, font: value })}
                  >
                    <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                      <SelectValue placeholder="Select a font">
                        <span style={{ 
                          fontFamily: allFonts.find(f => f.name === editingProfile.font)?.family 
                        }}>
                          {editingProfile.font}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                      <SelectItem 
                        value="default-fonts-header"
                        className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer font-semibold"
                        disabled
                      >
                        Default Fonts
                      </SelectItem>
                      {defaultFonts.map((font: Font) => (
                        <SelectItem 
                          key={font.name} 
                          value={font.name}
                          className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer"
                          style={{ fontFamily: font.family }}
                        >
                          {font.name}
                        </SelectItem>
                      ))}
                      {customFonts.length > 0 && (
                        <>
                          <SelectItem 
                            value="custom-fonts-header"
                            className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer font-semibold mt-2"
                            disabled
                          >
                            Custom Fonts
                          </SelectItem>
                          {customFonts.map((font) => (
                            <SelectItem 
                              key={font.name} 
                              value={font.name}
                              className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer"
                              style={{ fontFamily: font.family }}
                            >
                              {font.name}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Subtitle Text Size</label>
                    <Input 
                      type="text"
                      placeholder="Enter subtitle text size"
                      value={subtitleSizeInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        // Allow typing by updating the string state
                        setSubtitleSizeInput(e.target.value);
                      }}
                      onBlur={() => {
                        // Convert to number and apply constraints only when focus is lost
                        const parsed = parseInt(subtitleSizeInput);
                        const newSize = isNaN(parsed) ? 64 : parsed;
                        setSubtitleSizeInput(newSize.toString());
                        onEditingProfileChange({ 
                          ...editingProfile, 
                          subtitle_size: newSize
                        });
                      }}
                      className="bg-[#2A2A2A] border-[#3A3A3A]"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Subtitle Outline Size</label>
                    <Input 
                      type="text"
                      placeholder="Enter stroke size"
                      value={strokeSizeInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        // Allow typing by updating the string state
                        setStrokeSizeInput(e.target.value);
                      }}
                      onBlur={() => {
                        // Convert to number and apply constraints only when focus is lost
                        const parsed = parseInt(strokeSizeInput);
                        const newSize = isNaN(parsed) ? 8 : parsed;
                        setStrokeSizeInput(newSize.toString());
                        onEditingProfileChange({ 
                          ...editingProfile, 
                          stroke_size: newSize
                        });
                      }}
                      className="bg-[#2A2A2A] border-[#3A3A3A]"
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Subtitle Style</label>
                    <Select 
                      value={editingProfile.style || 'single'} 
                      onValueChange={(value: StyleOption) => onEditingProfileChange({ ...editingProfile, style: value })}
                    >
                      <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                        <SelectValue placeholder="Select a style" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                        {styles.map((style: { value: StyleOption; label: string }) => (
                          <SelectItem 
                            key={style.value} 
                            value={style.value}
                            className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer"
                          >
                            {style.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Background Video</label>
                    <Select 
                      value={editingProfile.background_video_type || 'gameplay'} 
                      onValueChange={(value: BackgroundVideoType) => {
                        console.log('Background video type changed to:', value);
                        onEditingProfileChange({ ...editingProfile, background_video_type: value });
                      }}
                    >
                      <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                        {backgroundVideoTypes.map((type) => (
                          <SelectItem 
                            key={type.value} 
                            value={type.value}
                            className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer"
                          >
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="audio" className="space-y-4 h-full">
              <div className="space-y-12">
                <div className="space-y-4">
                  <h3 className="font-medium text-white">Voice Settings</h3>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Voice</label>
                    <Select 
                      value={editingProfile.voice_id || ""} 
                      onValueChange={(value: string) => onEditingProfileChange({ ...editingProfile, voice_id: value })}
                    >
                      <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                        <SelectValue placeholder={loadingVoices ? "Loading voices..." : "Select a voice"}>
                          {editingProfile.voice_id && voices.find(voice => voice.voice_id === editingProfile.voice_id)?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                        {voices.map((voice) => (
                          <SelectItem 
                            key={voice.voice_id} 
                            value={voice.voice_id}
                            className="text-white hover:bg-[#2A2A2A] focus:bg-[#2A2A2A] cursor-pointer"
                          >
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <label className="text-sm text-white">Pitch Up</label>
                      <p className="text-xs text-muted-foreground">Increase the pitch of the voice</p>
                    </div>
                    <Switch
                      checked={editingProfile.pitch_up || false}
                      onCheckedChange={(checked) => onEditingProfileChange({ ...editingProfile, pitch_up: checked })}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-white">Audio Settings</h3>
                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <label className="text-sm text-white">Background Music</label>
                      <p className="text-xs text-muted-foreground">Add background music to your content</p>
                    </div>
                    <Switch
                      checked={editingProfile.has_background_music}
                      onCheckedChange={(checked: boolean) => 
                        onEditingProfileChange({ ...editingProfile, has_background_music: checked })
                      }
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button
            onClick={onSaveEdit}
            className="bg-primary hover:bg-primary/90"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 