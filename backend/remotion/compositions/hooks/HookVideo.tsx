import { useCurrentFrame, interpolate, Easing, Video, Audio, useVideoConfig } from 'remotion';
import React from 'react';
import { loadFont } from "@remotion/google-fonts/Roboto";

// We'll use these imports as fallbacks for local rendering
import verificationBadge from '../../assets/badge.png';
import bubble from '../../assets/bubble.svg';
import share from '../../assets/share.svg';
import video1 from '../../assets/videos/1.mp4';
import video2 from '../../assets/videos/2.mp4';
import video3 from '../../assets/videos/3.mp4';
import video4 from '../../assets/videos/4.mp4';
import video5 from '../../assets/videos/5.mp4';
import video6 from '../../assets/videos/6.mp4';
// Import static first frames
import frame1 from '../../assets/videos/frames/1.jpg';
import frame2 from '../../assets/videos/frames/2.jpg';
import frame3 from '../../assets/videos/frames/3.jpg';
import frame4 from '../../assets/videos/frames/4.jpg';
import frame5 from '../../assets/videos/frames/5.jpg';
import frame6 from '../../assets/videos/frames/6.jpg';

const { fontFamily } = loadFont();

interface Props {
  channelName?: string;
  channelImage?: string;
  hookText?: string;
  audioUrl?: string;
  audioDurationInSeconds?: number;
  // Add asset URLs props
  assetUrls?: {
    badge?: string;
    bubble?: string;
    share?: string;
    videos?: Record<string, string>;
    frames?: Record<string, string>;
  };
}

const VideoComponent: React.FC<{
  src: string;
  placeholder: string;
  style: React.CSSProperties;
}> = ({ src, placeholder, style }) => {
  return (
    <Video
      src={src}
      style={{
        ...style,
      }}
    />
  );
};

// Helper function to get asset URL or fallback to local import
const getAssetUrl = (assetUrls: any, key: string, fallback: any) => {
  if (assetUrls && assetUrls[key]) {
    return assetUrls[key];
  }
  return fallback;
};

// Helper function to get video URL
const getVideoUrl = (assetUrls: any, index: number, fallback: any) => {
  if (assetUrls && assetUrls.videos && assetUrls.videos[`video${index}`]) {
    return assetUrls.videos[`video${index}`];
  }
  return fallback;
};

// Helper function to get frame URL
const getFrameUrl = (assetUrls: any, index: number, fallback: any) => {
  if (assetUrls && assetUrls.frames && assetUrls.frames[`frame${index}`]) {
    return assetUrls.frames[`frame${index}`];
  }
  return fallback;
};

export const HookVideo: React.FC<Props> = ({
  channelImage,
  channelName,
  hookText,
  audioUrl,
  audioDurationInSeconds = 3,
  assetUrls = {}
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  // Choose a random video based on the hook text (deterministic)
  const getVideoIndex = () => {
    if (!hookText) return 1;
    
    // Use the first character of the hook text to determine the video
    const charCode = hookText.charCodeAt(0);
    return (charCode % 6) + 1;
  };
  
  const videoIndex = getVideoIndex();
  
  // Get video and frame URLs based on the index
  let videoSrc;
  let frameSrc;
  
  switch (videoIndex) {
    case 1:
      videoSrc = getVideoUrl(assetUrls, 1, video1);
      frameSrc = getFrameUrl(assetUrls, 1, frame1);
      break;
    case 2:
      videoSrc = getVideoUrl(assetUrls, 2, video2);
      frameSrc = getFrameUrl(assetUrls, 2, frame2);
      break;
    case 3:
      videoSrc = getVideoUrl(assetUrls, 3, video3);
      frameSrc = getFrameUrl(assetUrls, 3, frame3);
      break;
    case 4:
      videoSrc = getVideoUrl(assetUrls, 4, video4);
      frameSrc = getFrameUrl(assetUrls, 4, frame4);
      break;
    case 5:
      videoSrc = getVideoUrl(assetUrls, 5, video5);
      frameSrc = getFrameUrl(assetUrls, 5, frame5);
      break;
    case 6:
      videoSrc = getVideoUrl(assetUrls, 6, video6);
      frameSrc = getFrameUrl(assetUrls, 6, frame6);
      break;
    default:
      videoSrc = getVideoUrl(assetUrls, 1, video1);
      frameSrc = getFrameUrl(assetUrls, 1, frame1);
  }
  
  // Get other asset URLs
  const badgeUrl = getAssetUrl(assetUrls, 'badge', verificationBadge);
  const bubbleUrl = getAssetUrl(assetUrls, 'bubble', bubble);
  const shareUrl = getAssetUrl(assetUrls, 'share', share);
  
  // Timing calculations
  const initialGrowthFrames = 12; // 12 frames for initial growth
  const fallingDurationFrames = 15; // Exactly 15 frames for falling animation
  
  // Calculate slowGrowthFrames based on audio duration minus initial growth
  const audioFrames = Math.ceil(audioDurationInSeconds * fps);
  
  // Start falling animation 15 frames before audio ends
  const startFallingFrame = audioFrames - fallingDurationFrames;
  
  // Initial quick scale from 94% to 100% in 12 frames
  // Then smooth transition to slow growth
  const scale = interpolate(
    frame,
    [0, initialGrowthFrames, startFallingFrame],
    [0.7, 1, 1.08],
    {
      extrapolateRight: 'clamp',
      easing: (t) => {
        if (frame <= initialGrowthFrames) {
          // Fast start and slow down quickly
          return Easing.bezier(0.8, 0, 0.2, 1)(t);
        }
        // Linear growth for the second phase
        return t;
      }
    }
  );

  // Falling and rotating animation starts 15 frames before audio ends
  const yOffset = frame >= startFallingFrame ? interpolate(
    frame,
    [startFallingFrame, audioFrames],
    [0, 1285],
    {
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.87, 0, 0.13, 1)
    }
  ) : 0;

  const rotation = frame >= startFallingFrame ? interpolate(
    frame,
    [startFallingFrame, audioFrames],
    [0, 30],
    {
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.87, 0, 0.13, 1)
    }
  ) : 0;

  // Dynamic blur based on movement speed
  const blurAmount = frame >= startFallingFrame ? interpolate(
    frame,
    [startFallingFrame, startFallingFrame + (fallingDurationFrames * 0.5), audioFrames],
    [0, 5, 0],
    {
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.87, 0, 0.13, 1)
    }
  ) : 0;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
  };

  const cardStyle: React.CSSProperties = {
    width: 800,
    minHeight: 275,
    borderRadius: 50,
    backgroundColor: '#ffffff',
    transform: `
      translateY(${yOffset}px)
      rotate(${rotation}deg)
      scale(${scale})
    `,
    filter: `blur(${blurAmount}px)`,
    position: 'relative',
    padding: '10px 15px',
    border: '1px solid #000000',
    boxShadow: '10px 10px 10px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
  };

  const titleContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '10px',
  };

  const channelNameStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  };

  const gifContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '2px',
    alignItems: 'center',
    marginTop: '-5px',
  };

  const gifStyle: React.CSSProperties = {
    height: '45px',
    width: 'auto',
    objectFit: 'contain',
  };

  const profileImageStyle: React.CSSProperties = {
    width: '116px',
    height: '116px',
    borderRadius: '50%',
    backgroundColor: channelImage ? 'transparent' : '#FF4500',
    backgroundImage: channelImage ? `url(${channelImage})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '40px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    fontFamily,
  };

  const postTitleStyle: React.CSSProperties = {
    fontSize: '45px',
    color: '#1a1a1a',
    margin: '3px 0 0 6px',
    fontFamily,
    width: '95%',
    lineHeight: '0.9',
    flex: '1',
    overflow: 'visible',
  };

  const badgeStyle: React.CSSProperties = {
    height: '40px',
    width: 'auto',
    objectFit: 'contain',
  };

  const heartContainerStyle: React.CSSProperties = {
    position: 'relative',
    marginTop: 'auto',
    paddingTop: '10px',
    bottom: '10px',
    left: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const iconContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  };

  const iconGroupStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const heartIconStyle: React.CSSProperties = {
    height: '40px',
    width: '40px',
    stroke: '#888888',
    strokeWidth: '2',
    fill: 'none',
  };

  const bubbleIconStyle: React.CSSProperties = {
    height: '40px',
    width: '40px',
    filter: 'invert(55%) sepia(0%) saturate(636%) hue-rotate(155deg) brightness(94%) contrast(89%)',
  };

  const shareIconStyle: React.CSSProperties = {
    height: '40px',
    width: '40px',
    filter: 'invert(55%) sepia(0%) saturate(636%) hue-rotate(155deg) brightness(94%) contrast(89%)',
  };

  const counterStyle: React.CSSProperties = {
    fontSize: '28px',
    fontFamily,
    color: '#888888',
    fontWeight: '500',
  };

  const shareTextStyle: React.CSSProperties = {
    fontSize: '28px',
    fontFamily,
    color: '#888888',
    fontWeight: '500',
  };

  const shareContainerStyle: React.CSSProperties = {
    position: 'relative',
    marginTop: 'auto',
    paddingTop: '10px',
    bottom: '10px',
    right: '100px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginLeft: 'auto',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={profileImageStyle} />
          <div style={titleContainerStyle}>
            <div style={channelNameStyle}>
              <h1 style={titleStyle}>{channelName}</h1>
              <img src={badgeUrl} style={badgeStyle} alt="Verified" />
            </div>
            <div style={gifContainerStyle}>
              <VideoComponent src={video1} placeholder={frame1} style={gifStyle} />
              <VideoComponent src={video2} placeholder={frame2} style={gifStyle} />
              <VideoComponent src={video3} placeholder={frame3} style={gifStyle} />
              <VideoComponent src={video4} placeholder={frame4} style={gifStyle} />
              <VideoComponent src={video5} placeholder={frame5} style={gifStyle} />
              <VideoComponent src={video6} placeholder={frame6} style={gifStyle} />
            </div>
          </div>
        </div>
        <h2 style={postTitleStyle}>
          {hookText}
        </h2>
        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '10px'}}>
          <div style={heartContainerStyle}>
            <div style={iconContainerStyle}>
              <div style={iconGroupStyle}>
                <svg 
                  viewBox="0 0 24 24" 
                  style={heartIconStyle}
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span style={counterStyle}>99+</span>
              </div>
              <div style={iconGroupStyle}>
                <img src={bubbleUrl} style={bubbleIconStyle} alt="Comments" />
                <span style={counterStyle}>99+</span>
              </div>
            </div>
          </div>
          <div style={shareContainerStyle}>
            <div style={iconGroupStyle}>
              <img src={shareUrl} style={shareIconStyle} alt="Share" />
              <span style={shareTextStyle}>Share</span>
            </div>
          </div>
        </div>
      </div>
      {audioUrl && <Audio src={audioUrl} />}
    </div>
  );
}; 