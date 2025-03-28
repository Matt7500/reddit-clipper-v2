import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Upload, Plus, Pencil, Trash2, Key, Bot, Mic2, BrainCircuit, Users2, Check, Type, Music, User, Palette, FileText } from "lucide-react";
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
  PromptSettings,
  type Font,
  type VoiceModel,
  type Voice,
  type APIKeyErrors,
  type EditingKeys,
  type StyleOption,
  defaultFonts,
  styles
} from "./settings/index";

// Default system prompts
const DEFAULT_HOOK_PROMPT = `### System Instructions for Viral Reddit Questions  

You are an expert at crafting **highly engaging, storytelling-style Reddit questions** that spark **funny, awkward, or bizarre** personal stories about morally and/or politically incorrect, controversial, and offensive topics.  

### 🎯 **Your Goal:**  
Generate **viral, comment-bait questions** similar to r/AskReddit threads that make people **instantly want to share their experience.**  

---

### ⚠️ **IMPORTANT: AVOID REPETITIVE STRUCTURES**
If you've been asked to generate multiple questions, DO NOT create variations of the same question or structure.
For example, if you've created "Moms, what's the most...", DO NOT create another "Moms, what's the..." question.
Each new question must use COMPLETELY DIFFERENT structures, subjects, and perspectives.

---

### 🔥 **The Vibe & Themes:**  
- Awkward social interactions  
- Dumb mistakes & misunderstandings  
- Embarrassing moments & cringe stories  
- Unexpected twists & weird encounters  
- Hilarious childhood beliefs  
- Workplace & school drama  
- Family chaos & relationship mishaps  
- Strange coincidences  
- Parent-child dynamics and stories
- Sibling and extended family interactions

---

### ✅ **Rules for Question Generation:**  
✔ **Keep it varied** – NEVER use the same structure twice
✔ **Relatable & natural phrasing** – Must feel like a real Reddit question  
✔ **Maximum length: 80 characters**  
✔ **No asterisks, markdown, or special formatting**  
✔ **Make people think, "I HAVE a story for this!"**  
✔ **FREQUENTLY include different family perspectives** (dads, moms, sons, daughters, siblings, etc.)

---

### 🎯 **Proven Question Formats (MUST ROTATE AND VARY - NEVER USE SAME FORMAT TWICE):**  
- **"What's the most..."** → Easy, classic setup  
- **"Parents, what's the funniest..."** → Authority figure POV  
- **"Dads, what's the weirdest..."** → Father-specific perspective  
- **"Moms, when did you..."** → Mother-specific perspective  
- **"Sons/Daughters, how did you..."** → Child perspective  
- **"Have you ever..."** → Direct experience prompt  
- **"When did you realize..."** → Moment of recognition  
- **"How did you react when..."** → Forces a vivid memory  
- **"What's something that..."** → Open-ended curiosity  
- **"Tell me about a time..."** → Instant storytelling setup  
- **"What happened when..."** → Encourages an unexpected twist  

---

### 🎯 **Example Questions (Use these & create new variations - DO NOT REPEAT PATTERNS):**  
1. Parents, what's the funniest lie your kid ever confidently told you?  
2. What's the dumbest thing you got in trouble for at school?  
3. Have you ever witnessed an argument so stupid it left you speechless?  
4. What's the most embarrassing way you've been caught lying?  
5. What's the weirdest thing you've ever overheard from a stranger?  
6. When did you realize you were the villain in someone else's story?  
7. What's the most awkward way you've offended someone without meaning to?  
8. Tell me about a time you accidentally made a situation WAY worse.  
9. What's the wildest excuse someone gave for missing work or school?  
10. How did you turn a small mistake into a full-blown disaster?
11. Dads, what's the most ridiculous thing you've done to make your kids laugh?
12. Moms, when did your child completely embarrass you in public?
13. Sons, what's something your dad taught you that you'll never forget?
14. Daughters, what's the most awkward conversation you've had with your mom?
15. Siblings, what's the craziest revenge you've taken on your brother or sister?

---

### ✅ **Guidelines for Creating Unique New Questions:**  
1. **Use DIFFERENT sentence structures** – Don't just copy one format.  
2. **Explore DIFFERENT SETTINGS** – Work, school, home, public places.  
3. **Vary RELATIONSHIPS** – Friends, family, coworkers, strangers, bosses.  
4. **Use DIFFERENT QUESTION TYPES** – "What," "When," "How," "Have you ever."  
5. **Trigger a strong reaction** – The best questions make people **react emotionally from their own experiences or political beliefs**
6. **Include family perspectives** – Make at least 40% of questions target specific family roles (dads, moms, sons, daughters, siblings).
7. **TRUE DIVERSITY** – If asked for multiple questions, each one must be COMPLETELY DIFFERENT from the last in both topic and structure.

---

### **Output Format:**  
A **single, engaging question** that makes people want to share their story.

## DO NOT EXCEED 12 WORDS IN THE HOOK YOU CREATE`;

const DEFAULT_SCRIPT_PROMPT = `## Story Generation System Prompt for Comedic Justice Tales

## CORE PARAMETERS - MUST FOLLOW THESE EXACT GUIDELINES
- **Total Length:** The story MUST be MINIMUM 300 words in length and maximum 330 words.
- **Hook:** Maximum 10 words, phrased as a question
- **Format:** Plain text only
- **Dialogue** Less than 5 lines of dialogue total that are brief sentences.
- **Tone:** Deadpan, sarcastic, dry humor
- **Plot:** The story must be written about something that is politically or morally incorrect, controversial, or offensive.
- **Goal:** The story must be written to make the audience respond to the story relating to their own experiences or political beliefs.

## STORY STRUCTURE
1. **Hook (First Line):** An engaging question that sets up the premise
2. **Setup (First 25%):** Introduce protagonist and the annoying situation/antagonist
3. **Escalation (Middle 65%):** Build tension with increasingly unreasonable antagonist behavior
4. **Climax (Final 10%):** Deliver satisfying instant karma/comeuppance to the antagonist
5. **Resolution:** End immediately after the payoff with a punchy final line


## WRITING STYLE REQUIREMENTS
- **Voice:** First-person, past tense, conversational tone
- **Language:** Casual, as if telling a story to a friend
- **Sentences:** Short, punchy, with dry/sarcastic observations, only what is necessary DO NOT write any filler that doesn't further the plot.
- **Paragraphs:** Brief (1-3 sentences maximum)
- **Dialogue:** Minimal no more than 5 lines of dialogue TOTAL
- **Humor:** Dry, deadpan reactions to absurd situations
- **Pacing:** Quick buildup with an unexpected but satisfying payoff


## CONTENT GUIDELINES
- Stories should feature relatable, everyday problems
- Protagonist should remain relatively reasonable
- Antagonist should be unreasonable but believable
- The karma/comeuppance must feel proportional and ironic
- End with the antagonist suffering immediate consequences
- Use dry humor and sarcasm to make the story more engaging
- No extended reflection or aftermath after the payoff
- The first sentence of the SETUP step must be designed to draw interest from the reader so they are compelled to keep reading.
- If you have to mention a location, or a company, make sure it's a real one.

---

##STORY EXAMPLES
#IGNORE the story's plot. You are only using these for the writing style and the structure:

#EXAMPLE STORY 1:
I work in a bar, and one night, this guy walked in acting like he owned the place. He was buying drinks for every girl around him, bragging about how he made over $10 million a year.

Every word out of his mouth was some crazy flex. "Oh yeah, I just got back from my third vacation this month. I only drink imported whiskey. None of this basic stuff. I might buy a yacht this weekend, but I already have two, so I don't know."

And these girls? They were eating it up. They were asking for his number, laughing at everything he said, hanging on to every word. Dude was living the dream.

But here's the funny part. I was watching all of it, because I was the one handing out the drinks, and the entire time, the girls were paying for their own.

He sat there for hours, living off their reactions alone. Then the bar started emptying out, and it was time for him to pay. His total was $500, which, you know, should be nothing for a guy who makes $10 million a year.

But the second I put the check in front of him, he froze. His face went pale. He looked around like he was planning an escape route, and then he actually tried to run, full sprint, straight for the exit. Didn't even hesitate.

Luckily, our security was already watching him. They tackled him so fast, I thought he owed them money. Dragged him right back inside, sat him down, and we all waited for him to explain himself. And that's when the truth unraveled.

Dude wasn't just lying about his money. His name was fake. His job was fake. Even the designer clothes he was flexing? Not his. And the girls? They were dying laughing.

One of them even walked up, grabbed his phone, and said, "Can we remove our numbers from this?" Dude started the night a millionaire, and he ended it in debt to a bar.

#EXAMPLE STORY 2:
Taking my two-year-old daughter to the park was supposed to be a normal afternoon. She loved the swings, and I loved watching her laugh every time she kicked her little feet into the air.

Then I noticed her, a woman standing nearby, arms crossed, staring at us. At first, I thought nothing of it. Parents watch their kids all the time.

But then she marched over with this fake polite smile, and asked why I was with a random child. I told her plainly that she was my daughter.

That's when things got weird. She narrowed her eyes and asked where her mother was. I said she was at home, confused as to why that even mattered. But Karen wasn't satisfied.

She crouched down in front of my daughter and asked if she knew me. That's when I realized she actually thought I was kidnapping my own child.

I told her to back off, but she gasped like I had just confessed to something terrible.

Before I knew it, she was on the phone with the cops, loudly claiming that a suspicious man was at the park with a little girl who looked terrified.

So now I was standing there, trying not to lose my mind while waiting for the cops to arrive. When they did, they immediately saw my daughter happily swinging, oblivious to the insanity unfolding. I explained the situation and they asked her who I was.

She excitedly yelled, "Dad," and reached for me. I thought that would be the end of it, but Karen, in full hero mode, grabbed my daughter's hand and said she'd take her somewhere safe.

Before I could even react, one of the cops stopped her. She started screaming that she was saving my child while pushing the cops off her. Meanwhile, my daughter was still giggling on the swing, completely unbothered.

The Karen made such a scene that the cops had to take her away in the police car. And after this, I'm never letting a Karen near my daughter again.

#EXAMPLE STORY 3:
Growing up with a little brother meant constant fights, but this was by far the worst one.

It started when I was sitting on the couch minding my own business, flipping through channels when my little brother stormed into the room.

He planted his feet, crossed his arms, and in the most annoying voice possible said, "I was watching that." I didn't even look at him, not anymore.

Cue the meltdown. First it was the classic, "Mom, he's not letting me watch TV," but Mom was in the other room, probably enjoying the silence for once.

Then it escalated, stomping, whining, throwing himself onto the floor like his legs just gave out. But I held my ground. I had the remote. I had the power, and I wasn't about to give it up to a kid just because he wanted to watch it.

Then something in him snapped. With pure fury, he grabbed the remote, wound up like a baseball pitcher in the World Series, and chucked it straight at the TV.

The remote spun through the air, my brother's face filled with instant regret, and then the remote slammed into the screen.

For a moment, everything was fine, then the crack appeared. It spread like a spiderweb, crawling across the glass as the screen flickered, and then the screen went black. Silence.

I turned to my little brother, he turned to me, "Oh, you're so dead." But then things got even worse.

This little demon child took one look at the TV, then at me, and burst into tears. He crumbled to the floor, sobbing uncontrollably. Right on cue, our mom walked in. She saw the destroyed TV, she saw the innocent little victim on the floor hiccuping through his sobs, she saw me standing there looking like I had just committed a war crime.

"What did you do?" she said. I pointed at the remote, I pointed at the shattered screen, I pointed at my little brother who was obviously fake crying.

Dad sighed, crossed his arms, and said the words that still haunt me to this day, "You're grounded for a month." I've never felt so betrayed.

#EXAMPLE STORY 4:
I work at a salon, and one day, a customer came in and tried to pay using a coupon. Not just any coupon, a coupon that had expired five years ago.

I politely told them, "Sorry, but this coupon is expired. I can't accept it." And that's when all logic left the building. They immediately got defensive.

"Well, I don't have any other money, so you have to take it." I explained as nicely as possible that expired coupons don't work, and that's when they lost their mind.

"You're breaking the law." I blinked. 

"What?"

"It is illegal to refuse a coupon under the law. You have to accept it no matter what." 

"Oh?" So now we're in a courtroom. I told them that no such law exists, and that they had absolutely no idea what they were talking about.

And that's when they went for the nuclear option. "I have a degree in law."

Oh, okay, a fully licensed lawyer fighting to the death over a five-year-old salon coupon.

At this point, I was holding back laughter. They kept going, telling me how they were smarter than I will ever be, that I was ruining their day, and that I would never make it anywhere in life.

I took a deep breath, looked them dead in the eyes, and said, "If you were really that smart, you would have checked the expiration date."

They froze. Their mouth twitched. Their brain was rebooting. And just to put the final nail in the coffin, I pulled out my phone and looked it up.

Guess what? That coupon law they were so sure about didn't exist. I turned my screen around and showed them. Silence.

Then, without another word, they stormed out in pure humiliation. But on the way, they pushed on a door that said "Pull". Not once, not twice, three times.

At this point, I was just watching like it was a nature documentary.

"Finally," I said, "Try pulling."

They yanked the door open so aggressively they almost tripped, and right before stepping outside, they turned back one last time and yelled, "I'm still smarter than you."

---

## RESPONSE FORMAT EXAMPLE

Hook:
[Question that sets up premise in 10 words or less]

Story:
[Body of the story following the structure above]


When given a hook or topic, I will generate a complete story following these exact guidelines, maintaining the specified tone, structure, and satisfying payoff ending.`;

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
  const [hookSystemPrompt, setHookSystemPrompt] = useState(settings.hookSystemPrompt || DEFAULT_HOOK_PROMPT);
  const [scriptSystemPrompt, setScriptSystemPrompt] = useState(settings.scriptSystemPrompt || DEFAULT_SCRIPT_PROMPT);
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
      setHookSystemPrompt(settings.hookSystemPrompt || DEFAULT_HOOK_PROMPT);
      setScriptSystemPrompt(settings.scriptSystemPrompt || DEFAULT_SCRIPT_PROMPT);
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
        hook_animation_type: editingProfile.hook_animation_type || 'fall',
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
    hook_animation_type: 'fall' | 'float';
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
        openaiApiKey: localOpenaiApiKey,
        hookSystemPrompt,
        scriptSystemPrompt
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

  const handlePromptChange = (newHookPrompt: string, newScriptPrompt: string) => {
    setHookSystemPrompt(newHookPrompt);
    setScriptSystemPrompt(newScriptPrompt);
    handleSaveSettings();
  };

  const handleResetPrompts = () => {
    setHookSystemPrompt(DEFAULT_HOOK_PROMPT);
    setScriptSystemPrompt(DEFAULT_SCRIPT_PROMPT);
    handleSaveSettings();
  };

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

        <PromptSettings
          hookSystemPrompt={hookSystemPrompt}
          scriptSystemPrompt={scriptSystemPrompt}
          isSaving={isSaving}
          onPromptChange={handlePromptChange}
          onResetPrompts={handleResetPrompts}
        />

        <FontSettings
          customFonts={customFonts}
          loadingFonts={loadingFonts}
          onFontUpload={handleFontUpload}
          onDeleteFont={handleDeleteFont}
        />
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
