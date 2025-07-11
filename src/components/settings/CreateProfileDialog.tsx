import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, User, Palette, Music } from "lucide-react";
import { useState, useEffect } from "react";
import type { Font, StyleOption, Voice, BackgroundVideoType, HookAnimationType } from "./types";
import { defaultFonts, styles, backgroundVideoTypes, hookAnimationTypes } from "./types";

interface CreateProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateProfile: (data: {
    name: string;
    nickname?: string;
    image_url: string | null;
    font: string;
    voice_id?: string;
    style: StyleOption;
    has_background_music: boolean;
    background_music_volume?: number;
    background_video_type: BackgroundVideoType;
    hook_animation_type: HookAnimationType;
    audio_speed: number;
    subtitle_size: number;
    stroke_size: number;
    pitch_up: boolean;
  }) => Promise<void>;
  channelImage: string | null;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  customFonts: Font[];
  voices: Voice[];
  loadingVoices: boolean;
}

export const CreateProfileDialog = ({
  isOpen,
  onOpenChange,
  onCreateProfile,
  channelImage,
  onImageUpload,
  customFonts,
  voices,
  loadingVoices,
}: CreateProfileDialogProps) => {
  const [activeTab, setActiveTab] = useState("basic");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileNickname, setNewProfileNickname] = useState("");
  const [newProfileFont, setNewProfileFont] = useState(defaultFonts[0].name);
  const [newProfileVoiceId, setNewProfileVoiceId] = useState("");
  const [newProfileStyle, setNewProfileStyle] = useState<StyleOption>('single');
  const [newProfileBackgroundVideoType, setNewProfileBackgroundVideoType] = useState<BackgroundVideoType>('gameplay');
  const [newProfileHookAnimationType, setNewProfileHookAnimationType] = useState<HookAnimationType>('fall');
  const [newProfileBackgroundMusic, setNewProfileBackgroundMusic] = useState(false);
  const [newProfileBackgroundMusicVolume, setNewProfileBackgroundMusicVolume] = useState<number>(0.015);
  const [newProfileAudioSpeed, setNewProfileAudioSpeed] = useState<number>(1.3);
  const [newProfileSubtitleSize, setNewProfileSubtitleSize] = useState<number>(64);
  const [newProfileStrokeSize, setNewProfileStrokeSize] = useState<number>(8);
  const [newProfilePitchUp, setNewProfilePitchUp] = useState(false);
  const [subtitleSizeInput, setSubtitleSizeInput] = useState<string>("64");
  const [strokeSizeInput, setStrokeSizeInput] = useState<string>("8");
  const [invalidInputs, setInvalidInputs] = useState<{[key: string]: boolean}>({
    subtitleSize: false,
    strokeSize: false
  });

  useEffect(() => {
    if (isOpen) {
      setNewProfileName("");
      setNewProfileNickname("");
      setNewProfileFont(defaultFonts[0].name);
      setNewProfileVoiceId("");
      setNewProfileStyle('single');
      setNewProfileBackgroundVideoType('gameplay');
      setNewProfileHookAnimationType('fall');
      setNewProfileBackgroundMusic(false);
      setNewProfileBackgroundMusicVolume(0.015);
      setNewProfileAudioSpeed(1.3);
      setNewProfileSubtitleSize(64);
      setNewProfileStrokeSize(8);
      setNewProfilePitchUp(false);
      setSubtitleSizeInput("64");
      setStrokeSizeInput("8");
      setInvalidInputs({
        subtitleSize: false,
        strokeSize: false
      });
      setActiveTab("basic");
    }
  }, [isOpen]);

  const isValid = newProfileName.trim() !== "" && newProfileVoiceId !== "" && channelImage !== null;

  const handleCreateProfile = async () => {
    if (!isValid) return;

    await onCreateProfile({
      name: newProfileName,
      nickname: newProfileNickname.trim() || undefined,
      image_url: channelImage,
      font: newProfileFont,
      voice_id: newProfileVoiceId,
      style: newProfileStyle,
      background_video_type: newProfileBackgroundVideoType,
      hook_animation_type: newProfileHookAnimationType,
      has_background_music: newProfileBackgroundMusic,
      background_music_volume: newProfileBackgroundMusicVolume,
      audio_speed: newProfileAudioSpeed,
      subtitle_size: newProfileSubtitleSize,
      stroke_size: newProfileStrokeSize,
      pitch_up: newProfilePitchUp,
    });

    // Reset form
    setNewProfileName("");
    setNewProfileNickname("");
    setNewProfileFont(defaultFonts[0].name);
    setNewProfileVoiceId("");
    setNewProfileStyle('single');
    setNewProfileBackgroundVideoType('gameplay');
    setNewProfileHookAnimationType('fall');
    setNewProfileBackgroundMusic(false);
    setNewProfileBackgroundMusicVolume(0.015);
    setNewProfileAudioSpeed(1.3);
    setNewProfileSubtitleSize(64);
    setNewProfileStrokeSize(8);
    setNewProfilePitchUp(false);
    setSubtitleSizeInput("64");
    setStrokeSizeInput("8");
  };

  const allFonts = [...defaultFonts, ...customFonts];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#222222] text-white border border-white/10 flex flex-col min-h-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Channel Profile</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Create a new channel profile to customize your content.
          </DialogDescription>
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
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Channel Name</label>
                    <Input 
                      type="text"
                      placeholder="Enter your channel name"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      className="bg-[#2A2A2A] border-[#3A3A3A]"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Nickname (Optional)</label>
                    <Input 
                      type="text"
                      placeholder="Display name"
                      value={newProfileNickname}
                      onChange={(e) => setNewProfileNickname(e.target.value.slice(0, 32))}
                      className="bg-[#2A2A2A] border-[#3A3A3A]"
                      maxLength={32}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Audio Speed</label>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Slower</span>
                      <span className="text-sm text-white font-medium">{newProfileAudioSpeed.toFixed(1)}x</span>
                      <span className="text-xs text-muted-foreground">Faster</span>
                    </div>
                    <Slider 
                      value={[newProfileAudioSpeed]}
                      min={1.0}
                      max={2.0}
                      step={0.1}
                      onValueChange={(value) => {
                        setNewProfileAudioSpeed(value[0]);
                      }}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Adjusts the speed of both intro and main audio
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 h-full">
              <div className="space-y-4">
                <h3 className="font-medium text-white">Appearance</h3>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Font</label>
                  <Select 
                    value={newProfileFont} 
                    onValueChange={setNewProfileFont}
                  >
                    <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                      <SelectValue placeholder="Select a font">
                        <span style={{ 
                          fontFamily: allFonts.find(f => f.name === newProfileFont)?.family 
                        }}>
                          {newProfileFont}
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
                      {defaultFonts.map((font) => (
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
                        // Mark as invalid if not a number
                        setInvalidInputs({
                          ...invalidInputs,
                          subtitleSize: isNaN(Number(e.target.value))
                        });
                      }}
                      onBlur={() => {
                        // Convert to number and apply constraints only when focus is lost
                        const parsed = parseInt(subtitleSizeInput);
                        const newSize = isNaN(parsed) ? 64 : Math.max(0, parsed);
                        setSubtitleSizeInput(newSize.toString());
                        setNewProfileSubtitleSize(newSize);
                        setInvalidInputs({
                          ...invalidInputs,
                          subtitleSize: false
                        });
                      }}
                      className={`bg-[#2A2A2A] border-[#3A3A3A] ${invalidInputs.subtitleSize ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    />
                    {invalidInputs.subtitleSize && (
                      <p className="text-red-500 text-xs mt-1">Please enter a valid number</p>
                    )}
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
                        // Mark as invalid if not a number
                        setInvalidInputs({
                          ...invalidInputs,
                          strokeSize: isNaN(Number(e.target.value))
                        });
                      }}
                      onBlur={() => {
                        // Convert to number and apply constraints only when focus is lost
                        const parsed = parseInt(strokeSizeInput);
                        const newSize = isNaN(parsed) ? 8 : Math.max(0, parsed);
                        setStrokeSizeInput(newSize.toString());
                        setNewProfileStrokeSize(newSize);
                        setInvalidInputs({
                          ...invalidInputs,
                          strokeSize: false
                        });
                      }}
                      className={`bg-[#2A2A2A] border-[#3A3A3A] ${invalidInputs.strokeSize ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                    />
                    {invalidInputs.strokeSize && (
                      <p className="text-red-500 text-xs mt-1">Please enter a valid number</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm text-muted-foreground">Subtitle Style</label>
                    <Select 
                      value={newProfileStyle} 
                      onValueChange={(value: StyleOption) => setNewProfileStyle(value)}
                    >
                      <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                        <SelectValue placeholder="Select a style" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                        {styles.map((style) => (
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
                      value={newProfileBackgroundVideoType} 
                      onValueChange={(value: BackgroundVideoType) => setNewProfileBackgroundVideoType(value)}
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
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Hook Animation</label>
                  <Select 
                    value={newProfileHookAnimationType} 
                    onValueChange={(value: HookAnimationType) => setNewProfileHookAnimationType(value)}
                  >
                    <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                      <SelectValue placeholder="Select animation type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#222222] border border-[#3A3A3A]">
                      {hookAnimationTypes.map((type) => (
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
            </TabsContent>

            <TabsContent value="audio" className="space-y-4 h-full">
              <div className="space-y-12">
                <div className="space-y-4">
                  <h3 className="font-medium text-white">Voice Settings</h3>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Voice</label>
                    <Select 
                      value={newProfileVoiceId} 
                      onValueChange={setNewProfileVoiceId}
                    >
                      <SelectTrigger className="bg-[#2A2A2A] border-[#3A3A3A]">
                        <SelectValue placeholder={loadingVoices ? "Loading voices..." : "Select a voice"}>
                          {newProfileVoiceId && voices.find(voice => voice.voice_id === newProfileVoiceId)?.name}
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
                      checked={newProfilePitchUp}
                      onCheckedChange={setNewProfilePitchUp}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-white">Audio Settings</h3>
                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <label className="text-sm text-white">Background Music</label>
                    </div>
                    <Switch
                      checked={newProfileBackgroundMusic}
                      onCheckedChange={setNewProfileBackgroundMusic}
                    />
                  </div>
                  
                  {newProfileBackgroundMusic && (
                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center">
                        <label className="text-sm text-white">Music Volume</label>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(newProfileBackgroundMusicVolume * 100)}%
                        </span>
                      </div>
                      <Slider 
                        defaultValue={[newProfileBackgroundMusicVolume * 100]}
                        max={100}
                        step={1}
                        onValueChange={(value) => {
                          setNewProfileBackgroundMusicVolume(value[0] / 100);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button
            onClick={handleCreateProfile}
            disabled={!isValid}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            Create Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 