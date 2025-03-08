import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Plus, Pencil, Trash2, Users2 } from "lucide-react";
import type { ChannelProfile } from "@/types/channel";

interface ChannelProfilesProps {
  profiles: ChannelProfile[];
  profilesLoading: boolean;
  imageLoadErrors: Record<string, boolean>;
  onEditProfile: (profile: ChannelProfile) => void;
  onDeleteProfile: (id: string) => void;
  onCreateProfile: () => void;
}

export const ChannelProfiles = ({
  profiles,
  profilesLoading,
  imageLoadErrors,
  onEditProfile,
  onDeleteProfile,
  onCreateProfile,
}: ChannelProfilesProps) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-medium text-white flex items-center gap-2 text-xl">
          <Users2 className="w-5 h-5 text-primary" />
          Channel Profiles
        </h1>
        <Button 
          className="gap-2 bg-primary hover:bg-primary/90 text-white"
          onClick={onCreateProfile}
        >
          <Plus className="w-4 h-4" />
          New Profile
        </Button>
      </div>
      
      <div className="grid gap-4">
        {profilesLoading && profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-[#2A2A2A] border border-white/10">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
              <SettingsIcon className="w-6 h-6 text-primary" />
            </div>
            <h4 className="text-lg font-medium text-white mb-2">Loading Profiles...</h4>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Please wait while we load your channel profiles.
            </p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-[#2A2A2A] border border-white/10">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <SettingsIcon className="w-6 h-6 text-primary" />
            </div>
            <h4 className="text-lg font-medium text-white mb-2">No Profiles Yet</h4>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create your first channel profile to get started with customizing your content.
            </p>
            <Button 
              onClick={onCreateProfile}
              className="gap-2 bg-primary hover:bg-primary/90 text-white"
            >
              <Plus className="w-4 h-4" />
              Create Profile
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {profiles.map((profile) => (
              <div 
                key={profile.id}
                className="p-4 rounded-lg bg-[#2A2A2A] border border-white/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-gray-700 flex items-center justify-center">
                      {profile.image_url && !imageLoadErrors[profile.id] ? (
                        <img 
                          src={profile.image_url} 
                          alt={profile.name} 
                          className="w-full h-full object-cover"
                          onError={() => {
                            // Note: We're not updating imageLoadErrors here since it's passed as a prop
                            // The parent component should handle this error
                          }}
                        />
                      ) : (
                        <span className="text-white text-sm font-bold">
                          {profile.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">{profile.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditProfile(profile)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteProfile(profile.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}; 