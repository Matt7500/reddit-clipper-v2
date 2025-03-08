import { Button } from "@/components/ui/button";
import { Type, Upload, Trash2 } from "lucide-react";
import type { Font } from "./types";
import { defaultFonts } from "./types";

interface FontSettingsProps {
  customFonts: Font[];
  loadingFonts: boolean;
  onFontUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDeleteFont: (fontName: string) => Promise<void>;
}

export const FontSettings = ({
  customFonts,
  loadingFonts,
  onFontUpload,
  onDeleteFont,
}: FontSettingsProps) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-medium text-white flex items-center gap-2 text-xl">
          <Type className="w-5 h-5 text-primary" />
          Font Settings
        </h1>
      </div>
      <div className="space-y-6">
        <div className="space-y-4 p-4 rounded-lg bg-[#2A2A2A] border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-2">
              <Type className="w-5 h-5 text-blue-400" />
              <h4 className="font-medium text-white">Custom Fonts</h4>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2"
              disabled={loadingFonts}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.ttf,.otf,.woff,.woff2';
                input.onchange = (e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files) {
                    onFontUpload({ target } as React.ChangeEvent<HTMLInputElement>);
                  }
                };
                input.click();
              }}
            >
              <Upload className="w-4 h-4" />
              {loadingFonts ? "Uploading..." : "Upload Font"}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground mb-2">Available Fonts</div>
            <div className="grid gap-2">
              <div className="p-3 rounded-lg bg-[#222222] border border-white/10">
                <div className="font-semibold text-white mb-2">Default Fonts</div>
                <div className="grid gap-2">
                  {defaultFonts.map((font) => (
                    <div 
                      key={font.name}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5"
                    >
                      <span className="text-muted-foreground" style={{ fontFamily: font.family }}>{font.name}</span>
                      <span className="text-xs text-muted-foreground">System Font</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#222222] border border-white/10">
                <div className="font-semibold text-white mb-2">Custom Fonts</div>
                <div className="grid gap-2">
                  {customFonts.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      No custom fonts uploaded yet
                    </div>
                  ) : (
                    customFonts.map((font) => (
                      <div 
                        key={font.name}
                        className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5"
                      >
                        <span className="text-muted-foreground" style={{ fontFamily: font.family }}>{font.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-white/10 hover:text-red-400"
                          onClick={() => onDeleteFont(font.name)}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Supported formats: .ttf, .otf, .woff, .woff2
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}; 