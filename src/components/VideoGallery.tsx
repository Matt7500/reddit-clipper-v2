import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Images, Video, Trash2, Play, Pause, ChevronLeft, ChevronRight, Download, Copy } from "lucide-react";
import { Video as VideoType, VideoSort, VideoPagination } from "@/types/video";
import { videoService } from "@/services/videoService";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast";

const PAGE_SIZE = 8;

interface VideoGalleryProps {
  refreshTrigger?: number;
}

export const VideoGallery = ({ refreshTrigger }: VideoGalleryProps) => {
  const { user } = useAuth();
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [pausedVideoId, setPausedVideoId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<VideoPagination>({
    page: 0,
    pageSize: PAGE_SIZE,
  });
  const [totalVideos, setTotalVideos] = useState(0);
  const [sort, setSort] = useState<VideoSort>({
    column: 'created_at',
    ascending: false,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const initialRender = useRef(true); // Ref to track initial mount

  const fetchVideos = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, count } = await videoService.getVideos(user.id, pagination, sort);
      setVideos(data || []);
      setTotalVideos(count || 0);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast({
        title: "Error",
        description: "Failed to load videos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [user, pagination.page, sort]);

  // Effect to handle external refresh trigger
  useEffect(() => {
    // Don't run on initial mount or if trigger is undefined/initial value (0)
    if (initialRender.current || refreshTrigger === undefined || refreshTrigger === 0) {
      initialRender.current = false; // Mark initial mount as done after first run
      return;
    }

    console.log('VideoGallery: Refresh triggered by new video completion!');
    setPagination({ page: 0, pageSize: PAGE_SIZE });
    setSort({ column: 'created_at', ascending: false });
    // fetchVideos() will be called by the useEffect above when pagination/sort state changes.
    // Explicitly calling fetchVideos() ensures it runs even if dependencies haven't changed yet
    // and handles the case where user might be null briefly.
    if (user) {
      fetchVideos();
    }
  }, [refreshTrigger, user]); // Depend on refreshTrigger and user

  const handleDelete = async (videoId: string) => {
    try {
      await videoService.deleteVideo(videoId);
      setVideos(videos.filter(v => v.id !== videoId));
      toast({
        title: "Success",
        description: "Video deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting video:', error);
      toast({
        title: "Error",
        description: "Failed to delete video",
        variant: "destructive",
      });
    }
  };

  const handleSort = (column: VideoSort['column']) => {
    setSort(prev => ({
      column,
      ascending: prev.column === column ? !prev.ascending : false,
    }));
  };

  const handleVideoClick = async (video: VideoType) => {
    if (playingVideoId === video.id) {
      setPlayingVideoId(null);
      setPausedVideoId(null);
    } else {
      setPlayingVideoId(video.id);
      setPausedVideoId(null);
      await videoService.incrementViews(video.id);
    }
  };

  const handleVideoPause = (videoId: string) => {
    setPausedVideoId(videoId);
  };

  const handleVideoPlay = () => {
    setPausedVideoId(null);
  };

  const handleDownload = async (video: VideoType, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent video click event
    try {
      const response = await fetch(video.video_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const filename = `${video.title || 'video'}.mp4`;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Video downloaded successfully",
      });
    } catch (error) {
      console.error('Error downloading video:', error);
      toast({
        title: "Error",
        description: "Failed to download video",
        variant: "destructive",
      });
    }
  };

  const handleCopyTitle = async (video: VideoType, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent video click event
    try {
      const formattedTitle = `${video.title} 🤔 #shorts`;
      await navigator.clipboard.writeText(formattedTitle);
      
      // Set the copiedId to show feedback and clear after 2 seconds
      setCopiedId(video.id);
      setTimeout(() => setCopiedId(null), 2000);
      
      toast({
        title: "Copied!",
        description: "Title copied to clipboard",
      });
    } catch (error) {
      console.error('Error copying title:', error);
      toast({
        title: "Error",
        description: "Failed to copy title",
        variant: "destructive",
      });
    }
  };

  const totalPages = Math.ceil(totalVideos / PAGE_SIZE);

  return (
    <Card className="w-full p-6 backdrop-blur-lg bg-[#F1F1F1]/10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Images className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-white">Your Videos</h2>
        </div>
        
        <div className="flex justify-end">
          <Select
            value={sort.column}
            onValueChange={(value: VideoSort['column']) => handleSort(value)}
          >
            <SelectTrigger className="w-[180px] bg-transparent text-white border-white/20">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Latest First</SelectItem>
              <SelectItem value="channel_name">Channel Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(PAGE_SIZE).fill(null).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-gray-700 rounded-lg" style={{ aspectRatio: '9/16' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {videos.map((video, index) => (
            <div key={video.id} className="relative group animate-fade-in" style={{
              animationDelay: `${index * 0.1}s`
            }}>
              <div className="relative rounded-lg overflow-hidden border border-white/10" style={{ aspectRatio: '9/16' }}>
                {playingVideoId === video.id ? (
                  <>
                    <video
                      src={video.video_url}
                      controls
                      autoPlay
                      className="w-full h-full object-cover"
                      onEnded={() => {
                        setPlayingVideoId(null);
                        setPausedVideoId(null);
                      }}
                      onPause={() => handleVideoPause(video.id)}
                      onPlay={handleVideoPlay}
                    />
                    {pausedVideoId === video.id && (
                      <>
                        {/* Always visible info bar */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-black/0 p-4">
                          <h3 className="text-lg font-semibold text-white line-clamp-2 mb-2">{video.title}</h3>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                              {video.channel_image_url ? (
                                <img
                                  src={video.channel_image_url}
                                  alt={video.channel_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold">
                                  {video.channel_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <p className="text-sm text-white/80 truncate">{video.channel_name}</p>
                          </div>
                        </div>
                        {/* Hover overlay with controls */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Download button in top left */}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => handleDownload(video, e)}
                            className="absolute top-2 left-2 w-9 h-9 rounded-full bg-black/40 hover:bg-primary text-white"
                          >
                            <Download className="w-5 h-5" />
                          </Button>
                          
                          {/* Copy title button next to download */}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => handleCopyTitle(video, e)}
                            className="absolute top-2 left-14 w-9 h-9 rounded-full bg-black/40 hover:bg-primary text-white"
                          >
                            {copiedId === video.id ? (
                              <span className="text-xs">✓</span>
                            ) : (
                              <Copy className="w-5 h-5" />
                            )}
                          </Button>
                          
                          {/* Delete button in top right */}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(video.id);
                            }}
                            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/40 hover:bg-destructive text-white"
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                          
                          {/* Play button in center */}
                          <Button
                            size="icon"
                            onClick={() => handleVideoClick(video)}
                            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-white"
                          >
                            <Play className="w-6 h-6" />
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <img
                      src={video.thumbnail_url || '/placeholder-thumbnail.jpg'}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Always visible info bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-black/0 p-4">
                      <h3 className="text-lg font-semibold text-white line-clamp-2 mb-2">{video.title}</h3>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                          {video.channel_image_url ? (
                            <img
                              src={video.channel_image_url}
                              alt={video.channel_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-sm font-semibold">
                              {video.channel_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-white/80 truncate">{video.channel_name}</p>
                      </div>
                    </div>
                    {/* Hover overlay with controls */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Download button in top left */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleDownload(video, e)}
                        className="absolute top-2 left-2 w-9 h-9 rounded-full bg-black/40 hover:bg-primary text-white"
                      >
                        <Download className="w-5 h-5" />
                      </Button>
                      
                      {/* Copy title button next to download */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => handleCopyTitle(video, e)}
                        className="absolute top-2 left-14 w-9 h-9 rounded-full bg-black/40 hover:bg-primary text-white"
                      >
                        {copiedId === video.id ? (
                          <span className="text-xs">✓</span>
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </Button>
                      
                      {/* Delete button in top right */}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(video.id);
                        }}
                        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/40 hover:bg-destructive text-white"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                      
                      {/* Play button in center */}
                      <Button
                        size="icon"
                        onClick={() => handleVideoClick(video)}
                        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-white"
                      >
                        <Play className="w-6 h-6" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-center items-center gap-4 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
          disabled={pagination.page === 0}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-white">
          Page {pagination.page + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
          disabled={pagination.page >= totalPages - 1}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
};
