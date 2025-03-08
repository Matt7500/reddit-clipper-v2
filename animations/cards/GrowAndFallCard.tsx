import { useCurrentFrame, interpolate, Easing, Video } from 'remotion';
import { useEffect } from 'react';

// Add Google Fonts import in the head
useEffect(() => {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@700&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  return () => {
    document.head.removeChild(link);
  };
}, []);

interface Props {
  title?: string;
  content?: string;
  profileImage?: string;
  channelName?: string;
}

export const HookVideo: React.FC<Props> = ({
  profileImage,
  channelName = 'RedditStories'
}) => {
  // ... existing code ...
  const titleStyle: React.CSSProperties = {
    fontSize: '40px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    fontFamily: "'Roboto', sans-serif",
  };

  const postTitleStyle: React.CSSProperties = {
    fontSize: '50px',
    color: '#1a1a1a',
    margin: '3px 0 0 6px',
    fontFamily: "'Roboto', sans-serif",
    width: '80%',
    lineHeight: '0.8',
  };

  const counterStyle: React.CSSProperties = {
    fontSize: '28px',
    fontFamily: "'Roboto', sans-serif",
    color: '#888888',
    fontWeight: '500',
  };

  const shareTextStyle: React.CSSProperties = {
    fontSize: '28px',
    fontFamily: "'Roboto', sans-serif",
    color: '#888888',
    fontWeight: '500',
  };
  // ... existing code ...
  <h1 style={titleStyle}>{channelName}</h1>
  // ... existing code ...
  <h2 style={postTitleStyle}>
    Who's the most delusional person you've ever met?
  </h2>
  // ... existing code ...
} 