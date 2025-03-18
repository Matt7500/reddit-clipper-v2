import React from 'react';
import { AbsoluteFill, Series, Audio, useVideoConfig } from 'remotion';
import { HookVideo } from './hooks/HookVideo';
import { SubtitleComposition } from './subtitles/SubtitleComposition';
import { BackgroundVideo } from './BackgroundVideo';
import backgroundMusic from '../assets/music/music.mp3';

interface WordTiming {
  text: string;
  startFrame: number;
  endFrame: number;
  color?: string;
}

interface VideoInfo {
  path: string;
  durationInFrames: number;
  durationInSeconds?: number;
}

interface Props {
  // Hook props
  channelName?: string;
  channelImage?: string;
  hookText?: string;
  audioUrl?: string;
  audioDurationInSeconds?: number;
  
  // Subtitle props
  subtitleText: string;
  scriptAudioUrl: string;
  scriptAudioDurationInSeconds: number;
  wordTimings?: WordTiming[];
  framesPerWord?: number;
  totalDurationInFrames: number;
  subtitle_size?: number;
  stroke_size?: number;
  
  // Font props
  font?: string;
  fontUrl?: string;
  
  // Background video props
  backgroundVideoPath: string[] | VideoInfo[] | string;
  has_background_music?: boolean;
  backgroundMusicUrl?: string;
  
  // Asset URLs for HookVideo
  assetUrls?: {
    badge?: string;
    bubble?: string;
    share?: string;
    frames?: Record<string, string>;
    videos?: Record<string, string>;
  };
}

export const MainComposition: React.FC<Props> = ({
  // Hook props
  channelName = "Default Channel",
  channelImage = "",
  hookText = "Default Hook",
  audioUrl = "",
  audioDurationInSeconds = 3,
  
  // Subtitle props
  subtitleText,
  scriptAudioUrl,
  scriptAudioDurationInSeconds,
  wordTimings = [],
  framesPerWord = 30,
  totalDurationInFrames,
  subtitle_size = 64,
  stroke_size = 8,
  
  // Font props
  font = "Jellee",
  fontUrl,
  
  // Background video props
  backgroundVideoPath,
  has_background_music = false,
  backgroundMusicUrl = "",
  
  // Asset URLs
  assetUrls = {},
}) => {
  const { fps } = useVideoConfig();
  const scriptDurationInFrames = Math.ceil(scriptAudioDurationInSeconds * fps);
  const hookDurationInFrames = Math.ceil(audioDurationInSeconds * fps);

  // Verify our durations match what we expect
  const calculatedTotalFrames = hookDurationInFrames + scriptDurationInFrames;
  if (calculatedTotalFrames !== totalDurationInFrames) {
    console.warn(`Duration mismatch: expected ${totalDurationInFrames} frames but calculated ${calculatedTotalFrames} frames`);
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Background video layer */}
      <BackgroundVideo 
        backgroundVideoPath={backgroundVideoPath}
        totalDurationInFrames={totalDurationInFrames}
        volume={-100}
      />
      
      {/* Background music that spans entire video */}
      {has_background_music && (
        <Audio 
          src={backgroundMusic} 
          volume={0.015}
          loop
        />
      )}
      
      {/* Content layers */}
      <Series>
        <Series.Sequence durationInFrames={hookDurationInFrames}>
          <HookVideo
            channelName={channelName}
            channelImage={channelImage}
            hookText={hookText}
            audioUrl={audioUrl}
            audioDurationInSeconds={audioDurationInSeconds}
            assetUrls={assetUrls}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={scriptDurationInFrames}>
          <SubtitleComposition
            text={subtitleText}
            wordTimings={wordTimings}
            framesPerWord={Math.ceil(scriptDurationInFrames / subtitleText.split(' ').length)}
            scriptDurationInFrames={scriptDurationInFrames}
            font={font}
            fontUrl={fontUrl}
            subtitle_size={subtitle_size}
            stroke_size={stroke_size}
          />
          <Audio src={scriptAudioUrl} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}; 