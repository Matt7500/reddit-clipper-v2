import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { ChannelProfile } from "@/types/channel";

interface DeleteProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  profileToDelete: ChannelProfile | null;
  onConfirmDelete: () => void;
  imageLoadErrors: Record<string, boolean>;
}

export const DeleteProfileDialog = ({
  isOpen,
  onOpenChange,
  profileToDelete,
  onConfirmDelete,
  imageLoadErrors,
}: DeleteProfileDialogProps) => {
  if (!profileToDelete) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#222222] text-white">
        <DialogHeader>
          <DialogTitle>Delete Channel Profile</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            This action cannot be undone. This will permanently delete the profile and remove the associated image from storage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="p-4 rounded-md bg-[#2A2A2A] border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-gray-700 flex items-center justify-center">
                {profileToDelete.image_url && !imageLoadErrors[profileToDelete.id] ? (
                  <img 
                    src={profileToDelete.image_url} 
                    alt={profileToDelete.name} 
                    className="w-full h-full object-cover"
                    onError={() => {
                      // Note: We're not updating imageLoadErrors here since it's passed as a prop
                      // The parent component should handle this error
                    }}
                  />
                ) : (
                  <span className="text-white text-sm font-bold">
                    {profileToDelete.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="font-medium text-white">{profileToDelete.name}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
            >
              Delete Profile
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 