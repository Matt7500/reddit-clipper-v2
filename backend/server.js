import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { 
  deploySite, 
  deleteSite, 
  renderMediaOnLambda, 
  getFunctions,
  deployFunction,
  getOrCreateBucket,
  getSites,
  downloadMedia,
  deleteRender
} from '@remotion/lambda';
// Add direct imports for Lambda client functions we need
import {
  getRenderProgress
} from '@remotion/lambda/client';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ElevenLabsClient } from "elevenlabs";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { generateAudio, getAudioDuration, getAudioSampleRate, processAudio, cleanupFiles, transcribeAudio } from './utils/audioUtils.js';

// Initialize OpenAI client
let openaiClient = null;
let openRouterClient = null;

const getOpenAIClient = (apiKey) => {
  try {
    if (!openaiClient) {
      if (!apiKey) {
        throw new Error('OpenAI API key is required');
      }
      openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
  } catch (error) {
    console.error('Error initializing OpenAI client:', error);
    throw error;
  }
};

const getOpenRouterClient = (apiKey) => {
  try {
    if (!openRouterClient) {
      if (!apiKey) {
        throw new Error('OpenRouter API key is required');
      }
      openRouterClient = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    }
    return openRouterClient;
  } catch (error) {
    console.error('Error initializing OpenRouter client:', error);
    throw error;
  }
};

// Reset OpenAI client when API key changes
const resetOpenAIClient = () => {
  openaiClient = null;
};

// Reset OpenRouter client when API key changes
const resetOpenRouterClient = () => {
  openRouterClient = null;
};

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize dotenv
dotenv.config();

// AWS Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.warn('AWS credentials not found. Lambda rendering will not work.');
}

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// Lambda configuration
const LAMBDA_MEMORY_SIZE = 4096; // 4GB RAM
const LAMBDA_TIMEOUT = 300; // 5 minutes
const LAMBDA_DISK_SIZE = 10240; // 10GB disk space

// Store the bucket name returned by getOrCreateBucket
let remotionBucketName = null;

// Function to initialize Lambda (deploy function and site)
let remotionFunction = null;
let remotionSite = null;
const SITE_NAME = 'reddit-clipper-production-site';

// Track if assets have been uploaded to Remotion bucket
let assetsUploadedToRemotionBucket = false;

// Function to ensure required assets are uploaded to Remotion bucket
async function ensureAssetsInRemotionBucket() {
  if (assetsUploadedToRemotionBucket || !remotionBucketName) return;
  
  try {
    console.log('Uploading required assets to Remotion bucket...');
    
    // List of assets to ensure are in the Remotion bucket
    const requiredAssets = [
      // Video assets
      { localPath: path.join(__dirname, 'remotion/assets/videos/1.mp4'), s3Key: 'assets/videos/1.mp4' },
      { localPath: path.join(__dirname, 'remotion/assets/videos/2.mp4'), s3Key: 'assets/videos/2.mp4' },
      { localPath: path.join(__dirname, 'remotion/assets/videos/3.mp4'), s3Key: 'assets/videos/3.mp4' },
      { localPath: path.join(__dirname, 'remotion/assets/videos/4.mp4'), s3Key: 'assets/videos/4.mp4' },
      { localPath: path.join(__dirname, 'remotion/assets/videos/5.mp4'), s3Key: 'assets/videos/5.mp4' },
      { localPath: path.join(__dirname, 'remotion/assets/videos/6.mp4'), s3Key: 'assets/videos/6.mp4' },
      
      // UI assets
      { localPath: path.join(__dirname, 'remotion/assets/badge.png'), s3Key: 'assets/badge.png' },
      { localPath: path.join(__dirname, 'remotion/assets/bubble.svg'), s3Key: 'assets/bubble.svg' },
      { localPath: path.join(__dirname, 'remotion/assets/share.svg'), s3Key: 'assets/share.svg' },
      
      // Font assets
      { localPath: path.join(__dirname, 'remotion/assets/Roboto-Bold.ttf'), s3Key: 'fonts/Roboto-Bold.ttf' },
      { localPath: path.join(__dirname, 'remotion/assets/fonts/Jellee-Roman.ttf'), s3Key: 'assets/fonts/Jellee-Roman.ttf' }
    ];
    
    // Check each asset and upload if it doesn't exist
    for (const asset of requiredAssets) {
      try {
        // Check if asset already exists in bucket
        const getObjectCommand = new GetObjectCommand({
          Bucket: remotionBucketName,
          Key: asset.s3Key
        });
        
        try {
          // Try to head the object to see if it exists
          await s3Client.send(getObjectCommand);
          console.log(`Asset already exists in Remotion bucket: ${asset.s3Key}`);
        } catch (headError) {
          // Object doesn't exist, upload it
          if (headError.name === 'NoSuchKey' || headError.name === 'NotFound') {
            console.log(`Uploading asset to Remotion bucket: ${asset.s3Key}`);
            if (fs.existsSync(asset.localPath)) {
              await uploadToS3(asset.localPath, asset.s3Key);
              console.log(`Successfully uploaded: ${asset.s3Key}`);
            } else {
              console.warn(`Local asset not found: ${asset.localPath}`);
            }
          } else {
            throw headError;
          }
        }
      } catch (assetError) {
        console.error(`Error processing asset ${asset.s3Key}:`, assetError);
        // Continue with other assets
      }
    }
    
    // Create and upload a config file for the HookVideo component with the bucket URL
    const configContent = JSON.stringify({
      bucketName: remotionBucketName,
      region: AWS_REGION,
      timestamp: new Date().toISOString()
    });
    
    const configPath = path.join(__dirname, 'tmp', 'remotion-config.json');
    if (!fs.existsSync(path.dirname(configPath))) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, configContent);
    await uploadToS3(configPath, 'config/remotion-config.json');
    
    console.log('Required assets uploaded to Remotion bucket');
    assetsUploadedToRemotionBucket = true;
  } catch (error) {
    console.error('Error ensuring assets in Remotion bucket:', error);
    // Do not set assetsUploadedToRemotionBucket to true if there was an error
  }
}

const initializeLambda = async () => {
  try {
    console.log('Initializing Lambda with params:', {
      region: AWS_REGION,
      timeout: LAMBDA_TIMEOUT,
      memory: LAMBDA_MEMORY_SIZE,
      disk: LAMBDA_DISK_SIZE
    });
    
    // Make sure bucket exists and get the Remotion-managed bucket name
    console.log('Getting or creating Remotion S3 bucket...');
    const bucketResult = await getOrCreateBucket({
      region: AWS_REGION,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    });
    
    // Log the entire bucket result for debugging
    console.log('Bucket result:', JSON.stringify(bucketResult, null, 2));
    
    // Extract the bucket name from the result
    remotionBucketName = bucketResult.bucketName;
    
    if (!remotionBucketName) {
      throw new Error('Failed to retrieve bucket name from getOrCreateBucket()');
    }
    
    console.log(`Using Remotion S3 bucket: ${remotionBucketName}`);
    
    // Check if function already exists
    console.log('Checking for existing Lambda functions...');
    const functions = await getFunctions({
      region: AWS_REGION,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    });
    
    console.log(`Found ${functions.length} existing functions:`, 
      functions.map(f => ({ name: f.functionName, createdAt: f.createdAt })));
    
    // Deploy function if it doesn't exist or needs updating
    if (!functions.length || !remotionFunction) {
      console.log('Deploying new Remotion Lambda function...');
      remotionFunction = await deployFunction({
        region: AWS_REGION,
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        timeoutInSeconds: LAMBDA_TIMEOUT,
        memorySizeInMb: LAMBDA_MEMORY_SIZE,
        diskSizeInMb: LAMBDA_DISK_SIZE,
      });
      console.log('Remotion Lambda function deployed:', JSON.stringify(remotionFunction, null, 2));
    } else {
      remotionFunction = functions[0];
      console.log('Using existing Remotion Lambda function:', JSON.stringify(remotionFunction, null, 2));
    }
    
    // Check if site already exists
    console.log('Checking for existing Remotion sites...');
    try {
      const sites = await getSites({
        region: AWS_REGION,
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      });
      
      // Check if sites is an array
      if (Array.isArray(sites)) {
        console.log(`Found ${sites.length} existing sites:`, 
          sites.map(s => ({ name: s.id, url: s.serveUrl })));
        
        // Look for our specific site
        const existingSite = sites.find(s => s.id === SITE_NAME);
        if (existingSite) {
          console.log('Found existing site:', JSON.stringify(existingSite, null, 2));
          remotionSite = existingSite;
        }
      } else {
        console.log('Received sites in unexpected format:', sites);
      }
    } catch (siteError) {
      console.error('Error getting existing sites:', siteError);
      // Continue with site deployment
    }
    
    // Check if site already exists or deploy a new one
    if (!remotionSite) {
      console.log('Bundling Remotion site code...');
      console.time('bundle-time');
      const bundleResult = await bundle(path.join(__dirname, 'remotion/index.tsx'));
      console.timeEnd('bundle-time');
      console.log('Bundle result:', JSON.stringify(bundleResult, null, 2));
      
      console.log('Deploying new Remotion site...');
      console.time('deploy-site-time');
      remotionSite = await deploySite({
        siteName: SITE_NAME,
        entryPoint: './remotion/index.tsx',
        region: AWS_REGION,
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        bucketName: remotionBucketName
      });
      console.timeEnd('deploy-site-time');
      console.log('Remotion site deployed:', JSON.stringify(remotionSite, null, 2));
    } else {
      console.log('Using existing Remotion site:', JSON.stringify(remotionSite, null, 2));
    }
    
    // Now that the bucket is initialized, upload required assets
    await ensureAssetsInRemotionBucket();
    
    return remotionFunction;
  } catch (error) {
    console.error('Error initializing Lambda:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }
};

// Function to upload file to S3 and get a signed URL
const uploadToS3 = async (filePath, s3Key) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const fileStream = fs.createReadStream(filePath);
    const fileExtension = path.extname(filePath).toLowerCase();
    
    // Set the correct content type based on file extension
    let contentType = 'application/octet-stream'; // default
    if (fileExtension === '.mp4') {
      contentType = 'video/mp4';
    } else if (fileExtension === '.png') {
      contentType = 'image/png';
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (fileExtension === '.svg') {
      contentType = 'image/svg+xml';
    } else if (fileExtension === '.ttf') {
      contentType = 'font/ttf';
    } else if (fileExtension === '.woff') {
      contentType = 'font/woff';
    } else if (fileExtension === '.woff2') {
      contentType = 'font/woff2';
    }
    
    // Upload to S3 with the correct content type and ACL
    const uploadParams = {
      Bucket: remotionBucketName,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
      ACL: 'public-read' // Make the object publicly accessible
    };
    
    const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
    
    // Construct and return the S3 URL
    const s3Url = `https://${remotionBucketName}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
    console.log(`File uploaded to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    console.error(`Error uploading to S3: ${error.message}`);
    throw error;
  }
};

// Function to upload a remote URL to S3
const uploadRemoteUrlToS3 = async (url, s3Key) => {
  try {
    console.log(`Downloading from URL for S3 upload: ${url}`);
    
    // Download the file from the URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download from URL: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const fileExtension = path.extname(s3Key).toLowerCase();
    
    // Set the correct content type based on file extension
    let contentType = 'application/octet-stream'; // default
    if (fileExtension === '.mp4') {
      contentType = 'video/mp4';
    } else if (fileExtension === '.png') {
      contentType = 'image/png';
    } else if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (fileExtension === '.svg') {
      contentType = 'image/svg+xml';
    } else if (fileExtension === '.ttf') {
      contentType = 'font/ttf';
    } else if (fileExtension === '.woff') {
      contentType = 'font/woff';
    } else if (fileExtension === '.woff2') {
      contentType = 'font/woff2';
    }
    
    // Upload the buffer to S3 with the correct content type and ACL
    const uploadParams = {
      Bucket: remotionBucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read' // Make the object publicly accessible
    };
    
    const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
    
    // Construct and return the S3 URL
    const s3Url = `https://${remotionBucketName}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
    console.log(`File uploaded to S3 from URL: ${s3Url}`);
    return s3Url;
  } catch (error) {
    console.error(`Error uploading to S3 from URL: ${error.message}`);
    throw error;
  }
};

// Function to clean up S3 assets
const cleanupS3Assets = async (s3Keys) => {
  try {
    if (!remotionBucketName) {
      console.warn('Remotion bucket not initialized. Cannot clean up S3 assets.');
      return;
    }
    
    console.log(`Cleaning up ${s3Keys.length} assets from S3 bucket ${remotionBucketName}...`);
    
    for (const s3Key of s3Keys) {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: remotionBucketName,
        Key: s3Key,
      });
      
      await s3Client.send(deleteCommand);
      console.log(`Deleted S3 asset: ${s3Key}`);
    }
  } catch (error) {
    console.error('Error cleaning up S3 assets:', error);
  }
};

// In-memory cache for user settings
const userSettingsCache = new Map();

// Update Supabase client initialization
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- Serve Frontend Static Files FIRST ---
// Serve static files from the Vite build output directory (../dist)
const __frontendDist = path.resolve(__dirname, '..', 'dist');
console.log(`Serving frontend static files from: ${__frontendDist}`);
app.use(express.static(__frontendDist));
// --- End Frontend Static Serving ---

// --- Serve Specific Backend Static Assets AFTER Frontend ---
// These routes will be checked *after* the general static handler above.
// If a file exists in `../dist` (e.g., `../dist/videos/file.mp4`), it will be served from there.
// If not found there, Express will check these specific directories.
app.use('/videos', express.static(path.join(__dirname, 'public/videos')));
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
// Serve Remotion assets - ensure this path is correct relative to __dirname
app.use('/assets', express.static(path.join(__dirname, 'remotion/assets'), {
  maxAge: '1d' // Example cache control
}));
// --- End Backend Static Assets ---

// Ensure directories exist
const videosDir = path.join(__dirname, 'public/videos');
const audioDir = path.join(__dirname, 'public/audio');
const imagesDir = path.join(__dirname, 'public/images');
const transcriptionsDir = path.join(__dirname, 'public/transcriptions');
const backgroundsDir = path.join(videosDir, 'backgrounds');

const filesToCleanup = []; // Initialize filesToCleanup array

if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

if (!fs.existsSync(transcriptionsDir)) {
  fs.mkdirSync(transcriptionsDir, { recursive: true });
}

if (!fs.existsSync(backgroundsDir)) {
  fs.mkdirSync(backgroundsDir, { recursive: true });
}

async function createBackgroundVideo(requiredDurationSeconds, background_video_type) {
  try {
    console.log('Creating background video sequence...');
    console.log(`Required duration: ${requiredDurationSeconds} seconds`);
    console.log(`Using background video type: ${background_video_type}`);
    
    // Generate a Supabase storage URL base for the background-videos bucket
    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('background-videos');
    
    if (bucketError) {
      console.error('Error accessing background-videos bucket:', bucketError);
      throw bucketError;
    }
    
    // List files in the specific folder within the bucket
    const folderPath = background_video_type;
    const { data: folderFiles, error: folderError } = await supabase.storage
      .from('background-videos')
      .list(folderPath);
      
    if (folderError) {
      console.error(`Error listing files in folder: ${folderPath}`, folderError);
      throw folderError;
    }
    
    console.log(`Found ${folderFiles.length} files in Supabase background-videos/${folderPath}`);
    
    // Filter for MP4 files
    let mp4Files = folderFiles.filter(file => file.name.endsWith('.mp4'));
    
    if (mp4Files.length === 0) {
      console.warn(`No background videos found in background-videos/${folderPath}, checking root folder...`);
      
      // Fall back to the root directory of the bucket
      const { data: rootFiles, error: rootError } = await supabase.storage
        .from('background-videos')
        .list('');
        
      if (rootError) {
        console.error('Error listing files in root folder', rootError);
        throw rootError;
      }
      
      mp4Files = rootFiles.filter(file => file.name.endsWith('.mp4'));
      
      if (mp4Files.length === 0) {
        throw new Error('No background videos found in Supabase storage');
      }
    }
    
    // Randomly shuffle all videos using Math.random()
    const shuffledFiles = [...mp4Files];
    for (let i = shuffledFiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledFiles[i], shuffledFiles[j]] = [shuffledFiles[j], shuffledFiles[i]];
    }
    
    let selectedVideos = [];
    let totalDuration = 0;
    let totalFrames = 0;
    
    // Temporary directory to download videos for duration checking
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Keep track of used videos to ensure diversity
    const usedVideos = new Set();
    let availableVideos = [...shuffledFiles];
    
    while (totalDuration < requiredDurationSeconds) {
      // If we've used all videos, reset the pool
      if (availableVideos.length === 0) {
        availableVideos = [...shuffledFiles];
        usedVideos.clear();
        
        // Reshuffle the videos
        for (let i = availableVideos.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [availableVideos[i], availableVideos[j]] = [availableVideos[j], availableVideos[i]];
        }
      }
      
      // Pick a random video from available ones
      const randomIndex = Math.floor(Math.random() * availableVideos.length);
      const file = availableVideos[randomIndex];
      
      // Remove the selected video from available pool and add to used set
      availableVideos.splice(randomIndex, 1);
      usedVideos.add(file.name);
      
      const filePath = `${folderPath}/${file.name}`;
      
      // Generate public URL for the video
      const { data: { publicUrl } } = supabase.storage
        .from('background-videos')
        .getPublicUrl(filePath);
      
      // Download the video temporarily to check its duration
      const tempFilePath = path.join(tmpDir, file.name);
      
      // Use fetch to download the file
      const response = await fetch(publicUrl);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(tempFilePath, Buffer.from(buffer));
      
      // Get duration using ffprobe
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempFilePath}"`
      );
      const duration = parseFloat(durationOutput);
      const durationInFrames = Math.ceil(duration * 30); // Convert to frames at 30fps
      
      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      
      totalDuration += duration;
      totalFrames += durationInFrames;
      
      // Create an object with video info, using the Supabase URL
      selectedVideos.push({
        path: publicUrl,
        durationInFrames: durationInFrames,
        durationInSeconds: duration
      });

      if (totalDuration >= requiredDurationSeconds) {
        break;
      }
    }

    return { 
      videos: selectedVideos, 
      totalDurationInFrames: totalFrames,
      totalDurationInSeconds: totalDuration
    };
  } catch (error) {
    console.error('Error in createBackgroundVideo:', error);
    throw error;
  }
}

// Function to render hook video using Remotion Lambda
async function renderHookVideo(hookAudioPath, scriptAudioPath, channelName, channelImageUrl, hookText, scriptText, outputPath, openaiApiKey, elevenlabsApiKey, channelStyle = 'grouped', font = 'Jellee', fontUrl = null, has_background_music = false, subtitle_size = 64, stroke_size = 8, res, filesToCleanup, background_video_type = 'gameplay', userId, timestamp, openrouterApiKey = null, openrouterModel = null, hook_animation_type = 'fall') {
  let isProcessComplete = false; // Add variable declaration
  // Array to track S3 assets for cleanup
  const s3Assets = [];
  
  // Define renderResponse variable at the top level of the function so it's available in the catch block
  let renderResponse = null;
  
  try {
    console.log('Starting video generation process with Lambda...');
    console.log(`Using channel style: ${channelStyle}`);
    console.log(`Using font: ${font}`);
    console.log(`Using font URL: ${fontUrl || "None provided"}`); // Log the fontUrl for debugging
    console.log(`Using hook animation type: ${hook_animation_type}`); // Log the hook animation type
    
    // Special handling for Roboto font - use the bundled version instead of Google Fonts
    if (font === 'Roboto') {
      console.log('USING BUNDLED ROBOTO FONT - will not attempt to download from Google Fonts');
      // fontUrl will be null, which is fine - we will use the locally bundled font
    }
    
    console.log(`Background music enabled: ${has_background_music}`);
    
    // Get hook audio duration in frames (assuming 30fps)
    const { stdout: hookDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${hookAudioPath}"`);
    const hookDurationInSeconds = parseFloat(hookDurationStdout);
    
    // Get script audio duration
    const { stdout: scriptDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${scriptAudioPath}"`);
    const scriptDurationInSeconds = parseFloat(scriptDurationStdout);

    // Calculate total required duration
    const totalDurationInSeconds = hookDurationInSeconds + scriptDurationInSeconds;
    
    // Get word-level transcription with channel style
    console.log('Getting word-level transcription...');
    let wordTimings;
    try {
      wordTimings = await transcribeAudio(scriptAudioPath, elevenlabsApiKey, openaiApiKey, channelStyle, openrouterApiKey, openrouterModel);
      console.log('Transcription completed successfully');
    } catch (transcriptionError) {
      console.error('Transcription failed with error:', transcriptionError);
      console.log('Using fallback word timing generation...');
      
      // Create fallback word timings directly
      const fps = 30;
      const scriptFrames = Math.ceil(scriptDurationInSeconds * fps);
      const words = scriptText.split(' ').filter(word => word.trim() !== '');
      const framesPerWord = Math.floor(scriptFrames / words.length);
      
      wordTimings = [];
      for (let i = 0; i < words.length; i++) {
        const startFrame = i * framesPerWord;
        const endFrame = (i === words.length - 1) ? scriptFrames : (i + 1) * framesPerWord;
        
        wordTimings.push({
          text: words[i],
          startFrame,
          endFrame,
          color: 'white'
        });
      }
      
      console.log(`Created fallback timings for ${wordTimings.length} words`);
    }
    
    // Now that transcription is actually complete, send the status
    console.log('Transcription completed');
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'transcription_complete',
      hookDuration: hookDurationInSeconds,
      scriptDuration: scriptDurationInSeconds
    }) + '\n\n');
    
    // Initialize Lambda if not already done
    if (!remotionFunction) {
      console.log('Initializing Lambda...');
      await initializeLambda();
    }
    
    if (!remotionBucketName) {
      throw new Error('Failed to initialize Remotion bucket. Check AWS credentials.');
    }
    
    // Start video generation immediately after transcription
    console.log('Starting video generation with Lambda...');
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'video_processing'
    }) + '\n\n');
    
    // Generate background video sequence
    const { videos, totalDurationInFrames } = await createBackgroundVideo(totalDurationInSeconds, background_video_type);
    console.log(`Background videos generated: ${videos.length} videos`);
    
    // Upload all assets to S3 for Lambda to access
    console.log('Uploading assets to S3 for Lambda...');
    
    // 1. Upload audio files to S3
    const hookAudioS3Key = `audio/${userId}/${timestamp}-hook-audio.mp3`;
    const scriptAudioS3Key = `audio/${userId}/${timestamp}-script-audio.mp3`;
    
    const hookAudioUrl = await uploadToS3(hookAudioPath, hookAudioS3Key);
    const scriptAudioUrl = await uploadToS3(scriptAudioPath, scriptAudioS3Key);
    
    s3Assets.push(hookAudioS3Key, scriptAudioS3Key);
    
    // 2. Upload channel image to S3 if it's a URL
    let channelImageS3Url = channelImageUrl;
    if (channelImageUrl && channelImageUrl.startsWith('http')) {
      const channelImageS3Key = `images/${userId}/${timestamp}-channel-image${path.extname(channelImageUrl) || '.jpg'}`;
      channelImageS3Url = await uploadRemoteUrlToS3(channelImageUrl, channelImageS3Key);
      s3Assets.push(channelImageS3Key);
    }
    
    // 3. Upload font file to S3 if provided
    let fontS3Url = null;
    console.log(`Checking font URL: ${fontUrl}`);
    
    if (fontUrl && typeof fontUrl === 'string' && fontUrl.startsWith('http')) {
      console.log(`Uploading font from URL: ${fontUrl}`);
      try {
        const fontExtension = path.extname(fontUrl) || '.ttf';
        const fontS3Key = `fonts/${userId}/${timestamp}-font${fontExtension}`;
        fontS3Url = await uploadRemoteUrlToS3(fontUrl, fontS3Key);
        console.log(`Successfully uploaded font to S3, URL: ${fontS3Url}`);
        s3Assets.push(fontS3Key);
      } catch (fontError) {
        console.error(`Error uploading font to S3: ${fontError.message}`);
        // Continue without the custom font if there's an error
        fontS3Url = null;
      }
    } else {
      console.log(`No valid font URL provided, using default font: ${font}`);
    }
    
    // 4. Upload background videos to S3 if they're URLs
    const backgroundVideosWithS3Urls = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (video.path && video.path.startsWith('http')) {
        const videoS3Key = `videos/backgrounds/${userId}/${timestamp}-bg-${i}${path.extname(video.path) || '.mp4'}`;
        const videoS3Url = await uploadRemoteUrlToS3(video.path, videoS3Key);
        backgroundVideosWithS3Urls.push({
          ...video,
          path: videoS3Url
        });
        s3Assets.push(videoS3Key);
      } else {
        backgroundVideosWithS3Urls.push(video);
      }
    }
    
    const fps = 30;
    const hookFrames = Math.ceil(hookDurationInSeconds * fps);
    const scriptFrames = Math.ceil(scriptDurationInSeconds * fps);
    const totalFrames = hookFrames + scriptFrames;
    
    // If the site hasn't been deployed yet, do it now
    if (!remotionSite) {
      console.log('Deploying Remotion site for Lambda...');
      const bundled = await bundle(path.join(__dirname, 'remotion/index.tsx'));
      
      remotionSite = await deploySite({
        siteName: SITE_NAME,
        entryPoint: './remotion/index.tsx',
        region: AWS_REGION,
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        bucketName: remotionBucketName
      });
      console.log('Remotion site deployed:', remotionSite.serveUrl);
    } else {
      console.log('Using existing Remotion site:', remotionSite.serveUrl);
    }
    
    // Before starting the render, add a check to ensure the site is accessible
    // Add this after the site deployment section in renderHookVideo
    if (!remotionSite) {
      throw new Error('Failed to initialize Remotion site. Check AWS credentials and network connectivity.');
    }
    
    // Verify that the site is accessible
    console.log('Verifying Remotion site accessibility...');
    try {
      const siteResponse = await fetch(remotionSite.serveUrl);
      if (!siteResponse.ok) {
        console.error(`Site check failed with status: ${siteResponse.status} ${siteResponse.statusText}`);
        // If the site isn't accessible, try to redeploy it
        console.log('Redeploying site due to accessibility issues...');
        
        remotionSite = await deploySite({
          siteName: SITE_NAME,
          entryPoint: './remotion/index.tsx',
          region: AWS_REGION,
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
          bucketName: remotionBucketName
        });
        
        console.log('Site redeployed:', remotionSite.serveUrl);
      } else {
        console.log('Remotion site is accessible:', remotionSite.serveUrl);
      }
    } catch (siteCheckError) {
      console.error('Error checking site accessibility:', siteCheckError);
      // Continue despite error - the render will fail if the site is truly inaccessible
    }
    
    // Log progress updates to client
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'uploading_assets',
      progress: 70
    }) + '\n\n');
    
    // Update progress
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'uploading_assets',
      progress: 80
    }) + '\n\n');
    
    // Prepare input props for Remotion Lambda
    const inputProps = {
      channelName,
      channelImage: channelImageS3Url,
      hookText,
      audioUrl: hookAudioUrl,
      audioDurationInSeconds: hookDurationInSeconds,
      hook_animation_type, // Add hook_animation_type to inputProps
      subtitleText: scriptText,
      scriptAudioUrl: scriptAudioUrl,
      scriptAudioDurationInSeconds: scriptDurationInSeconds,
      wordTimings,
      totalDurationInFrames: totalFrames,
      backgroundVideoPath: backgroundVideosWithS3Urls,
      channelStyle,
      font,
      fontUrl: fontS3Url, // Only use the S3 URL if we managed to upload it
      has_background_music,
      subtitle_size,
      stroke_size,
      // Add bucket information
      bucketName: remotionBucketName,
      bucketRegion: AWS_REGION
    };
    
    console.log('Remotion input props prepared:', {
      font,
      fontUrl: fontS3Url,
      totalDurationInFrames: totalFrames,
      hook_animation_type // Add hook_animation_type to logging
    });
    
    console.log('Starting Lambda rendering...');
    
    // Calculate frameRange correctly (adjust for 0-indexing)
    const frameRange = [0, totalFrames - 2]; // Adjust to ensure we're within the composition's range
    
    console.log(`Rendering frames: ${frameRange[0]}-${frameRange[1]} (total: ${totalFrames} frames)`);
    
    // Render with Lambda
    console.log('Starting Lambda rendering with simplified configuration...');
    try {
      renderResponse = await renderMediaOnLambda({
        region: AWS_REGION,
        functionName: remotionFunction.functionName,
        serveUrl: remotionSite.serveUrl,
        composition: 'MainComposition',
        inputProps,
        codec: 'h264',
        imageFormat: 'jpeg',
        videoBitrate: '6M',
        x264Preset: 'fast',
        maxRetries: 3,
        framesPerLambda: 20, // Lower value for better reliability
        concurrencyPerLambda: 3, // Reduce concurrency to avoid overwhelming Lambda
        privacy: 'private',
        frameRange: frameRange,
        outName: `${userId}-${timestamp}.mp4`,
        timeoutInMilliseconds: LAMBDA_TIMEOUT * 1000,
        bucketName: remotionBucketName,
        chromiumOptions: {
          disableWebSecurity: true,
          ignoreCertificateErrors: true
        },
        webhookUrl: null,
        onProgress: (progress) => {
          console.log(`Rendering progress: ${progress.renderedFrames}/${progress.totalFrames} frames (${Math.floor(progress.renderedFrames / progress.totalFrames * 100)}%)`);
          
          // Send progress updates to client
          res.write(JSON.stringify({
            type: 'status_update',
            status: 'video_processing',
            progress: Math.floor(progress.renderedFrames / progress.totalFrames * 100)
          }) + '\n\n');
        },
      });
      console.log('Lambda render completed successfully:', renderResponse);
    } catch (renderError) {
      console.error('Lambda render error:', renderError);
      
      // Check if the error contains detailed information
      if (renderError.cause) {
        console.error('Error cause:', renderError.cause);
      }
      
      if (renderError.message) {
        console.error('Error message:', renderError.message);
      }
      
      // Try to log all render error details
      console.error('Full render error details:', JSON.stringify(renderError, null, 2));
      
      // Throw the error to continue with error handling
      throw renderError;
    }
    
    // Wait for rendering to complete by polling the status
    console.log('Waiting for Lambda rendering to complete by polling status...');
    
    // Poll the status every 5 seconds
    const POLL_INTERVAL = 5000; 
    
    let renderComplete = false;
    let outputUrl = null;
    
    // Maximum wait time - 10 minutes
    const MAX_WAIT_TIME = 10 * 60 * 1000;
    const startTime = Date.now();
    
    try {
      while (!renderComplete) {
        // Check if we've exceeded the maximum wait time
        if (Date.now() - startTime > MAX_WAIT_TIME) {
          throw new Error('Rendering timed out after 10 minutes');
        }
        
        // Get the current render progress using the directly imported function
        try {
          const progress = await getRenderProgress({
            renderId: renderResponse.renderId,
            functionName: remotionFunction.functionName,
            region: AWS_REGION,
            bucketName: remotionBucketName,
          });
          
          // Progress is returned as a value between 0-1, convert to percentage for logging
          const progressPercent = Math.floor(progress.overallProgress * 100);
          console.log(`Render progress: ${progressPercent}%, Done: ${progress.done}`);
          
          // Send progress updates to client
          res.write(JSON.stringify({
            type: 'status_update',
            status: 'video_processing',
            progress: progressPercent
          }) + '\n\n');
          
          // Check if the rendering is complete
          if (progress.done) {
            renderComplete = true;
            outputUrl = progress.outputFile;
            console.log('Lambda render completed. Output URL:', outputUrl);
          } else if (progress.fatalErrorEncountered) {
            // Log the detailed progress object for debugging
            console.error('Render failed with errors. Full progress object:', JSON.stringify(progress, null, 2));
            
            // Extract the specific error message from the errors array if possible
            let errorMessage = 'Unknown error';
            
            if (progress.errors && Array.isArray(progress.errors) && progress.errors.length > 0) {
              // If errors is an array of objects with a message property
              if (typeof progress.errors[0] === 'object' && progress.errors[0].message) {
                errorMessage = progress.errors.map(err => err.message).join(', ');
              } else {
                // If errors is an array of strings
                errorMessage = progress.errors.join(', ');
              }
            } else if (progress.errors && typeof progress.errors === 'object') {
              // If errors is a single object
              errorMessage = JSON.stringify(progress.errors);
            } else if (progress.errors) {
              // If errors is a primitive value
              errorMessage = String(progress.errors);
            }
            
            throw new Error(`Rendering failed: ${errorMessage}`);
          } else {
            // Wait before polling again
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
          }
        } catch (pollError) {
          // Check if it's a JSON parsing error
          if (pollError.message && pollError.message.includes('Unexpected token \'<\'')) {
            console.error('Received HTML response instead of JSON when polling progress');
            console.error('This is likely due to AWS service issues or authentication problems');
            
            // Instead of failing, try to continue polling after a longer wait
            console.log('Waiting longer before retrying progress check...');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 3));
            
            // Counter to limit number of retries
            if (!this.pollErrorCount) {
              this.pollErrorCount = 1;
            } else {
              this.pollErrorCount++;
            }
            
            // If we've had too many errors, assume the render might be complete and try to proceed
            if (this.pollErrorCount > 5) {
              console.log('Too many polling errors, assuming render might be complete and attempting to proceed...');
              renderComplete = true;
              
              // Try to construct a possible S3 URL for the output
              if (renderResponse && renderResponse.renderId) {
                const possibleS3Key = `renders/${renderResponse.renderId}/${renderResponse.outName || `${userId}-${timestamp}.mp4`}`;
                outputUrl = `https://${remotionBucketName}.s3.${AWS_REGION}.amazonaws.com/${possibleS3Key}`;
                console.log('Constructed possible output URL:', outputUrl);
              }
            }
          } else {
            // For other errors, rethrow
            throw pollError;
          }
        }
      }
      
      if (!outputUrl) {
        throw new Error('Rendering completed but no output URL was provided');
      }
    } catch (progressError) {
      console.error('Error while polling render progress:', progressError);
      throw progressError; // Re-throw to be caught by the outer try/catch
    }
    
    // Download the rendered video using Remotion's downloadMedia function
    console.log('Downloading rendered video using downloadMedia...');
    let downloadSuccessful = false;
    let videoDownloadedPath = null;
    
    try {
      // Use the directly imported downloadMedia function
      try {
        const { outputPath: downloadedPath, sizeInBytes } = await downloadMedia({
          renderId: renderResponse.renderId,
          bucketName: remotionBucketName,
          functionName: remotionFunction.functionName,
          region: AWS_REGION,
          outPath: outputPath
        });
        
        console.log(`Video downloaded to: ${downloadedPath} (${sizeInBytes} bytes)`);
        downloadSuccessful = true;
        videoDownloadedPath = downloadedPath;
        
        // Remove the file from files to clean up since it was successfully downloaded
        const fileIndex = filesToCleanup.indexOf(outputPath);
        if (fileIndex > -1) {
          filesToCleanup.splice(fileIndex, 1);
        }
      } catch (dlError) {
        // Check if this is a JSON parsing error from an HTML response
        if (dlError.message && dlError.message.includes('Unexpected token \'<\'')) {
          console.error('Received HTML response instead of JSON from Lambda API');
          console.error('This is likely due to AWS service issues or authentication problems');
          
          // Try to get the video directly from S3 if we have the renderId
          if (renderResponse && renderResponse.renderId) {
            console.log('Attempting to download video directly from S3...');
            
            try {
              // Construct the expected S3 key based on renderId
              const s3VideoKey = `renders/${renderResponse.renderId}/${renderResponse.outName || `${userId}-${timestamp}.mp4`}`;
              
              // Create a temporary file to download to
              const getCommand = new GetObjectCommand({
                Bucket: remotionBucketName,
                Key: s3VideoKey
              });
              
              // Get a signed URL for the video
              const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
              
              // Download the file using fetch
              const response = await fetch(signedUrl);
              
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(outputPath, Buffer.from(buffer));
                
                console.log(`Video downloaded directly from S3 to: ${outputPath}`);
                downloadSuccessful = true;
                videoDownloadedPath = outputPath;
              } else {
                throw new Error(`Failed to download from S3: ${response.statusText}`);
              }
            } catch (s3Error) {
              console.error('Error downloading directly from S3:', s3Error);
              throw new Error(`Failed to download video from Lambda or S3: ${dlError.message}`);
            }
          } else {
            throw new Error(`Failed to download video due to AWS service issue: ${dlError.message}`);
          }
        } else {
          throw dlError; // Re-throw if it's not the HTML response error
        }
      }
    } catch (downloadError) {
      console.error('Error downloading video using downloadMedia:', downloadError);
      throw new Error(`Failed to download video: ${downloadError.message}`);
    }
    
    // Upload video to Supabase storage
    console.log('Uploading video to Supabase storage...');
    const videoFileName = `${userId}/${timestamp}-video.mp4`;
    const videoFileBuffer = fs.readFileSync(videoDownloadedPath);
    const { data: videoData, error: videoError } = await supabase.storage
      .from('videos')
      .upload(videoFileName, videoFileBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600'
      });

    if (videoError) throw videoError;

    // Get video URL
    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(videoFileName);

    // Generate thumbnail using ffmpeg
    console.log('Generating thumbnail...');
    const thumbnailPath = path.join(imagesDir, `thumbnail-${timestamp}.jpg`);
    await execAsync(`ffmpeg -i "${videoDownloadedPath}" -ss 00:00:01 -frames:v 1 "${thumbnailPath}"`);

    // Upload thumbnail to Supabase storage
    console.log('Uploading thumbnail to Supabase storage...');
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailFileName = `${userId}/${timestamp}-thumbnail.jpg`;
    const { data: thumbnailData, error: thumbnailError } = await supabase.storage
      .from('thumbnails')
      .upload(thumbnailFileName, thumbnailBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600'
      });

    if (thumbnailError) throw thumbnailError;

    // Get thumbnail URL
    const { data: { publicUrl: thumbnailUrl } } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(thumbnailFileName);

    // Clean up the output video and thumbnail files since they're now in Supabase
    await cleanupFiles([videoDownloadedPath, thumbnailPath]);

    // Delete the render from Lambda/S3 now that we've downloaded and stored it in Supabase
    if (renderResponse && renderResponse.renderId) {
      try {
        console.log(`Deleting Lambda render with ID: ${renderResponse.renderId}`);
        const { freedBytes } = await deleteRender({
          renderId: renderResponse.renderId,
          bucketName: remotionBucketName,
          region: AWS_REGION,
        });
        console.log(`Lambda render deleted successfully. Freed ${freedBytes} bytes of storage.`);
      } catch (deleteError) {
        console.error('Error deleting Lambda render:', deleteError);
        // Continue execution even if deletion fails
      }
    }

    // Save video metadata to database
    console.log('Saving video metadata to database...');
    const { data: videoMetadata, error: dbError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        title: hookText,
        thumbnail_url: thumbnailUrl,
        video_url: videoUrl,
        channel_name: channelName,
        hook_text: hookText,
        script_text: scriptText,
        views: 0,
        duration: hookDurationInSeconds + scriptDurationInSeconds,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Set process as complete before sending final response
    isProcessComplete = true;

    // Clean up all temporary S3 assets
    console.log('Cleaning up S3 assets...');
    await cleanupS3Assets(s3Assets);

    // Clean up all remaining temporary files
    console.log('Cleaning up all temporary files...');
    await cleanupFiles(filesToCleanup);

    // Send final success response with Supabase URLs
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'video_complete',
      success: true,
      message: 'Audio and video processing completed successfully',
      videoMetadata: {
        ...videoMetadata,
        video_url: videoUrl,
        title: hookText
      },
      channelName,
      channelImage: channelImageUrl,
      hookVideo: videoUrl
    }) + '\n\n');

    res.end();
  } catch (error) {
    console.error('Error rendering video with Lambda:', error);
    
    // Clean up S3 assets if there was an error
    if (s3Assets.length > 0) {
      console.log('Cleaning up S3 assets due to error...');
      try {
        await cleanupS3Assets(s3Assets);
      } catch (cleanupError) {
        console.error('Error cleaning up S3 assets:', cleanupError);
      }
    }
    
    // If a Lambda render was initiated, try to cancel it
    if (renderResponse && renderResponse.renderId) {
      try {
        console.log(`Attempting to cancel Lambda render with ID: ${renderResponse.renderId}`);
        // Use deleteRender to clean up the render
        await deleteRender({
          renderId: renderResponse.renderId,
          bucketName: remotionBucketName,
          region: AWS_REGION,
        });
        console.log('Lambda render deleted successfully');
      } catch (cancelError) {
        console.error('Error cancelling Lambda render:', cancelError);
      }
    }
    
    // Send error status to client
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'error',
      message: `Error rendering video: ${error.message}`
    }) + '\n\n');
    
    throw error;
  }
}

// API endpoint to save user settings
app.post('/api/save-user-settings', async (req, res) => {
  try {
    const { userId, elevenlabsApiKey, elevenlabsVoiceModel, openaiApiKey, openrouterApiKey, openrouterModel, hookSystemPrompt, scriptSystemPrompt, otherSettings } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId. Please provide a valid user ID.' 
      });
    }
    
    console.log(`Saving settings for user: ${userId}`);
    
    // Reset clients if API keys are being updated
    if (openaiApiKey) {
      resetOpenAIClient();
    }
    
    if (openrouterApiKey) {
      resetOpenRouterClient();
    }
    
    // Save to in-memory cache
    userSettingsCache.set(userId, {
      elevenlabsApiKey,
      elevenlabsVoiceModel,
      openaiApiKey,
      openrouterApiKey,
      openrouterModel,
      hookSystemPrompt,
      scriptSystemPrompt,
      ...otherSettings,
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`Settings saved for user: ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'User settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to get user settings
app.get('/api/user-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId. Please provide a valid user ID.' 
      });
    }
    
    // Get from in-memory cache
    const userSettings = userSettingsCache.get(userId);
    
    if (!userSettings) {
      return res.status(404).json({ 
        success: false, 
        error: 'User settings not found. Please save settings first.' 
      });
    }
    
    res.json({ 
      success: true, 
      settings: userSettings
    });
  } catch (error) {
    console.error('Error retrieving user settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Modified generate-video endpoint to use Lambda rendering
app.post('/api/generate-video', async (req, res) => {

  // Array to keep track of files to clean up
  const filesToCleanup = [];
  let isProcessComplete = false;
  const timestamp = Date.now();

  try {
    const { 
      hook, 
      script,
      userId,
      channelId,
      channelName,
      channelImageUrl,
      channelVoiceId,
      channelStyle,
      channelFont,
      channelFontUrl,
      // Settings
      elevenlabsApiKey,
      elevenlabsVoiceModel,
      openaiApiKey,
      openrouterApiKey,
      openrouterModel,
      useUserSettings = true,
      has_background_music,
      target_duration,
      subtitle_size = 64,
      stroke_size = 8,
      background_video_type = 'gameplay',
      hook_animation_type = 'fall',
      pitch_up = false
    } = req.body;

    console.log('Received request with userId:', userId);
    console.log('useUserSettings:', useUserSettings);
    console.log('Channel font:', channelFont);
    console.log('Pitch up enabled:', pitch_up);
    console.log('Hook animation type:', hook_animation_type);
    console.log('Rendering with AWS Lambda enabled');

    // Validate AWS credentials
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return res.status(400).json({
        success: false,
        error: 'AWS credentials not found. Lambda rendering is not available.'
      });
    }

    // Validate required fields
    if (!hook || !script || !userId || !channelVoiceId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters. Please provide hook, script, userId, and channelVoiceId.' 
      });
    }

    // Validate API keys
    if (!elevenlabsApiKey) {
      return res.status(400).json({
        success: false,
        error: 'ElevenLabs API key is required for voice generation. Please add it to your settings.'
      });
    }

    if (!openaiApiKey && !openrouterApiKey) {
      return res.status(400).json({
        success: false, 
        error: 'Either OpenAI or OpenRouter API key is required for subtitle generation. Please add at least one to your settings.'
      });
    }

    // If OpenRouter is being used, ensure the model is specified
    if (openrouterApiKey && !openrouterModel) {
      return res.status(400).json({
        success: false,
        error: 'OpenRouter model is required when using OpenRouter API. Please specify a model in your settings.'
      });
    }
    
    // Send initial status update that we're using Lambda
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'initializing',
      message: 'Initializing video generation with AWS Lambda'
    }) + '\n\n');
    
    // Initialize Lambda early to ensure the bucket is ready
    if (!remotionFunction || !remotionBucketName) {
      console.log('Pre-initializing Lambda for video generation...');
      await initializeLambda();
      
      if (!remotionBucketName) {
        return res.status(500).json({
          success: false,
          error: 'Failed to initialize Remotion bucket. Check AWS credentials.'
        });
      }
    }
    
    console.log(`Using Remotion Lambda bucket: ${remotionBucketName}`);

    // Generate unique IDs for the audio files
    const hookAudioRawPath = path.join(audioDir, `hook-raw-${timestamp}.mp3`);
    const scriptAudioRawPath = path.join(audioDir, `script-raw-${timestamp}.mp3`);
    const hookAudioProcessedPath = path.join(audioDir, `hook-processed-${timestamp}.mp3`);
    const scriptAudioProcessedPath = path.join(audioDir, `script-processed-${timestamp}.mp3`);

    // Add files to cleanup list
    filesToCleanup.push(
      hookAudioRawPath,
      scriptAudioRawPath,
      hookAudioProcessedPath,
      scriptAudioProcessedPath
    );

    // Use the channel's voice ID directly
    console.log(`Using channel voice ID: ${channelVoiceId}`);
    const voiceId = channelVoiceId;

    // Get available models
    console.log('Fetching available TTS models');
    const modelsResponse = await fetch('https://api.elevenlabs.io/v1/models', {
      headers: {
        'Accept': 'application/json',
        'xi-api-key': elevenlabsApiKey
      }
    });

    if (!modelsResponse.ok) {
      throw new Error('Failed to fetch models from ElevenLabs');
    }

    const modelsData = await modelsResponse.json();
    const ttsModels = modelsData.filter(model => model.can_do_text_to_speech);
    
    if (ttsModels.length === 0) {
      throw new Error('No text-to-speech models available');
    }

    // Use the specified voice model
    const modelId = elevenlabsVoiceModel;
    console.log(`Using TTS model: ${modelId}`);

    // Send audio processing status
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'audio_processing'
    }) + '\n\n');

    // Generate audio for hook
    console.log('Generating audio for hook...');
    const hookAudioBuffer = await generateAudio(hook, elevenlabsApiKey, voiceId, modelId);
    fs.writeFileSync(hookAudioRawPath, Buffer.from(hookAudioBuffer));
    console.log(`Raw hook audio saved to: ${hookAudioRawPath}`);
    
    // Generate audio for script
    console.log('Generating audio for script...');
    const scriptAudioBuffer = await generateAudio(script.replace('\"', '"'), elevenlabsApiKey, voiceId, modelId);
    fs.writeFileSync(scriptAudioRawPath, Buffer.from(scriptAudioBuffer));
    console.log(`Raw script audio saved to: ${scriptAudioRawPath}`);

    // Process hook audio with fixed speed (1.2x) and pitch_up if enabled
    console.log('Processing hook audio...');
    // For hook audio, we always use speed factor 1.2, regardless of pitch_up setting
    const hookSpeedFactor = 1.2;
    await processAudio(hookAudioRawPath, hookAudioProcessedPath, hookSpeedFactor, pitch_up, true);
    
    // Clean up raw hook audio file since we have the processed version
    await cleanupFiles([hookAudioRawPath]);

    // Get hook duration after processing
    const { stdout: hookDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${hookAudioProcessedPath}"`);
    const hookDurationInSeconds = parseFloat(hookDurationStdout);

    // First remove silences from script audio without speed adjustment
    const scriptSilenceRemovedPath = path.join(audioDir, `script-silence-removed-${timestamp}.mp3`);
    filesToCleanup.push(scriptSilenceRemovedPath);
    await processAudio(scriptAudioRawPath, scriptSilenceRemovedPath, 1.0, pitch_up, false);
    
    // Clean up raw script audio file since we have the silence-removed version
    await cleanupFiles([scriptAudioRawPath]);

    // Get script duration after silence removal but before speed adjustment
    const { stdout: scriptDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${scriptSilenceRemovedPath}"`);
    const scriptDurationAfterSilenceRemoval = parseFloat(scriptDurationStdout);

    // Calculate required speed factor for script to meet target duration
    let scriptSpeedFactor = 1.25; // Default speed factor
    console.log('Debug - target_duration:', target_duration);
    console.log('Debug - target_duration type:', typeof target_duration);
    if (target_duration && target_duration > 0) {
      console.log('Debug - Entered target duration block');
      const targetScriptDuration = target_duration - hookDurationInSeconds;
      console.log('Debug - targetScriptDuration:', targetScriptDuration);
      if (targetScriptDuration > 0) {
        scriptSpeedFactor = Math.max(0.8, Math.min(2.0, scriptDurationAfterSilenceRemoval / targetScriptDuration));
        console.log(`Detailed timing breakdown:`);
        console.log(`- Target total duration: ${target_duration}s`);
        console.log(`- Hook duration: ${hookDurationInSeconds}s`);
        console.log(`- Target script duration: ${targetScriptDuration}s`);
        console.log(`- Raw script duration: ${scriptDurationAfterSilenceRemoval}s`);
        console.log(`- Calculated speed factor: ${scriptSpeedFactor}x`);
        console.log(`- Estimated final script duration: ${scriptDurationAfterSilenceRemoval / scriptSpeedFactor}s`);
        console.log(`- Estimated total duration: ${hookDurationInSeconds + (scriptDurationAfterSilenceRemoval / scriptSpeedFactor)}s`);
      }
    }

    // Process script audio with calculated speed factor
    console.log(`Processing script audio with speed factor: ${scriptSpeedFactor}x`);
    await processAudio(scriptSilenceRemovedPath, scriptAudioProcessedPath, scriptSpeedFactor, pitch_up, false, target_duration - hookDurationInSeconds);
    
    // Clean up silence-removed script audio file since we have the final processed version
    await cleanupFiles([scriptSilenceRemovedPath]);

    // Send audio completion status
    const hookAudioUrl = `/audio/${path.basename(hookAudioProcessedPath)}`;
    const scriptAudioUrl = `/audio/${path.basename(scriptAudioProcessedPath)}`;
    
    console.log('Sending audio completion status...');
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'audio_complete',
      hookAudio: hookAudioUrl,
      scriptAudio: scriptAudioUrl
    }) + '\n\n');

    // Send transcription processing status
    console.log('Starting transcription...');
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'transcription_processing'
    }) + '\n\n');

    // Generate hook video
    console.log('Generating hook video...');
    const hookVideoPath = path.join(__dirname, 'public/videos', `hook-${timestamp}.mp4`);
    filesToCleanup.push(hookVideoPath); // Add to cleanup list

    try {
      await renderHookVideo(
        hookAudioProcessedPath,
        scriptAudioProcessedPath,
        channelName,
        channelImageUrl,
        hook,
        script,
        hookVideoPath,
        openaiApiKey,
        elevenlabsApiKey,
        channelStyle,
        channelFont || 'Jellee',
        channelFontUrl,
        has_background_music,
        subtitle_size,
        stroke_size,
        res,
        filesToCleanup,
        background_video_type,
        userId,
        timestamp,
        openrouterApiKey,
        openrouterModel,
        hook_animation_type
      );

      // Remove the redundant code since it's now handled in renderHookVideo
      isProcessComplete = true;
    } catch (renderError) {
      console.error('Error rendering video:', renderError);
      
      // Send error status to client
      res.write(JSON.stringify({
        type: 'status_update',
        status: 'error',
        message: `Error rendering video: ${renderError.message}`
      }) + '\n\n');
      
      throw renderError;
    }
  } catch (error) {
    console.error('Audio processing error:', error);
    
    // Only clean up files if the process failed
    if (!isProcessComplete) {
      console.log('Error occurred, cleaning up temporary files...');
      await cleanupFiles(filesToCleanup);
    }
    
    // Make sure we send an error response if we haven't already
    try {
      res.write(JSON.stringify({
        type: 'status_update',
        status: 'error',
        message: error.message || 'An unknown error occurred during processing'
      }) + '\n\n');
      res.end();
    } catch (responseError) {
      console.error('Error sending error response:', responseError);
    }
  }
});

// Add login endpoint to save user settings
app.post('/api/login', async (req, res) => {
  try {
    const { userId, elevenlabsApiKey, elevenlabsVoiceModel, openaiApiKey, openrouterApiKey, openrouterModel, otherSettings } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId. Please provide a valid user ID.' 
      });
    }
    
    console.log(`User login: ${userId}`);
    
    // Save settings to cache on login if provided
    if (elevenlabsApiKey || elevenlabsVoiceModel || openaiApiKey || openrouterApiKey || openrouterModel || otherSettings) {
      const existingSettings = userSettingsCache.get(userId) || {};
      
      userSettingsCache.set(userId, {
        ...existingSettings,
        ...(elevenlabsApiKey && { elevenlabsApiKey }),
        ...(elevenlabsVoiceModel && { elevenlabsVoiceModel }),
        ...(openaiApiKey && { openaiApiKey }),
        ...(openrouterApiKey && { openrouterApiKey }),
        ...(openrouterModel && { openrouterModel }),
        ...(otherSettings && { ...otherSettings }),
        lastUpdated: new Date().toISOString()
      });
      
      console.log(`Settings updated for user: ${userId}`);
      
      // Reset clients if API keys changed
      if (openaiApiKey && openaiApiKey !== existingSettings.openaiApiKey) {
        console.log('OpenAI API key changed, resetting client');
        resetOpenAIClient();
      }
      
      if (openrouterApiKey && openrouterApiKey !== existingSettings.openrouterApiKey) {
        console.log('OpenRouter API key changed, resetting client');
        resetOpenRouterClient();
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Login successful',
      settings: userSettingsCache.get(userId) || {}
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add endpoint for generating scripts
app.post('/api/generate-script', async (req, res) => {
  try {
    const { openrouterApiKey, openrouterModel, customHook, hookOnly, userId } = req.body;

    console.log('Received request with OpenRouter API key:', openrouterApiKey);
    console.log('Received request with OpenRouter model:', openrouterModel);
    console.log('Received request with custom hook:', customHook);
    console.log('Hook only mode:', hookOnly);
    console.log('User ID:', userId);

    // Validate OpenRouter API key
    if (!openrouterApiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing OpenRouter API key.'
      });
    }

    // Get OpenRouter client with the provided API key
    const openrouterClient = getOpenRouterClient(openrouterApiKey);
    
    // Get user settings if userId is provided
    let userSettings = null;
    if (userId) {
      userSettings = userSettingsCache.get(userId);
      console.log('Using custom prompts for user:', userId);
    }
    
    // Default system prompt for story generation - this remains unchanged
    const defaultScriptSystemPrompt = `## Story Generation System Prompt for Comedic Justice Tales

## CORE PARAMETERS - MUST FOLLOW THESE EXACT GUIDELINES
- **Total Length:** The story MUST be MINIMUM 300 words in length and maximum 330 words.
- **Hook:** Maximum 10 words, phrased as a question
- **Format:** Plain text only

## STORY GUIDELINES - MUST FOLLOW THESE EXACT GUIDELINES
- **Dialogue** Less than 5 lines of dialogue total that are brief sentences.
- **Tone:** Deadpan, sarcastic, dry humor
- **Plot:** The story must be written about something that is politically or morally incorrect, controversial, or offensive. The story should elicit a strong NEGATIVE emotional response from the reader.
- **Antagonist:** The antagonist must be highly unreasonabel, unlikable and NOT have any redeeming qualities.
- **Protagonist:** The protagonist must be reasonable, relatable and have some redeeming qualities.

## STORY STRUCTURE - CRITICAL TIMING REQUIREMENTS
1. **Opening Hook (First 5%):**
   - Start with an attention-grabbing line that creates immediate interest
   - Set initial scene without revealing the True Climax of the story
   - Create a sense of intrigue or conflict

2. **Setup Phase (Next 20%):**
   - Introduce key characters and initial situation
   - Establish the normal world or context
   - Plant subtle seeds for later payoff
   - NO major revelations or climactic elements

3. **Progressive Tension (Middle 40%):**
   Phase 1 (~15%): Initial conflict introduction
   - Introduce the first layer of conflict
   - Begin building reader investment
   
   Phase 2 (~15%): First complications
   - Add new layers of tension
   - Deepen the conflict without resolving it
   
   Phase 3 (~10%): Rising stakes
   - Escalate the situation
   - Build anticipation for resolution

4. **False Peak (Next 25%):**
   - Create misdirection that suggests one outcome
   - Lead readers down an expected path
   - Set up for subversion of expectations
   - Plant red herrings that seem obvious

5. **True Climax (Final 10% ONLY):**
   - Deliver the REAL unexpected twist
   - Reveal the actual resolution
   - End with immediate, satisfying payoff
   - No extended aftermath or reflection


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

I politely told them, \"Sorry, but this coupon is expired. I can't accept it.\" And that's when all logic left the building. They immediately got defensive.

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

    // Default hook system prompt
    const defaultHookSystemPrompt = `### System Instructions for Viral Reddit Questions  

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
- Unexpected twists & weird encounters  
- Workplace drama and stories
- Terrible bosses and coworkers
- Terrible customers and clients interactions
- School and college drama stories
- Family dramas and relationship dramas
- Parent-child dynamics and stories
- Terrible sibling and extended family dramas

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

    // Use custom script prompt if available, otherwise use default
    const openrouterSystemPrompt = userSettings?.scriptSystemPrompt || defaultScriptSystemPrompt;
    
    // Use custom hook prompt if available, otherwise use default
    const hookSystemPrompt = userSettings?.hookSystemPrompt || defaultHookSystemPrompt;

    // Clean markdown from text while preserving newlines
    const cleanText = (text) => {
      return text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .trim();
    };

    // ROUTE 1: Generate only a hook
    if (hookOnly) {
      console.log('Generating hook only...');
      try {
        // Define topics with their weights
        const topics = [
          { name: 'Teachers', weight: 30 },
          { name: 'Parents', weight: 20 },
          { name: 'Dads', weight: 20 },
          { name: 'General', weight: 20 },
          { name: 'Karen', weight: 10 }
        ];

        // Function to select a topic based on weighted probabilities
        const selectWeightedTopic = (topics) => {
          // Calculate total weight
          const totalWeight = topics.reduce((sum, topic) => sum + topic.weight, 0);
          
          // Generate a random number between 0 and totalWeight
          const randomValue = Math.random() * totalWeight;
          
          // Find the topic that corresponds to the random value
          let cumulativeWeight = 0;
          for (const topic of topics) {
            cumulativeWeight += topic.weight;
            if (randomValue <= cumulativeWeight) {
              return topic.name;
            }
          }
          
          // Fallback to the last topic
          return topics[topics.length - 1].name;
        };

        // Select a topic based on weighted probabilities
        const selectedTopic = selectWeightedTopic(topics);
        console.log(`Selected topic for hook generation: ${selectedTopic}`);

        // Generate hook using OpenRouter with custom/default prompt
        const hookCompletion = await openrouterClient.chat.completions.create({
          model: openrouterModel,
          messages: [
            {
              role: "system",
              content: hookSystemPrompt
            },
            {
              role: "user",
              content: `Totally new question:`
            }
          ],
          temperature: 1,
          max_tokens: 40
        });

        // Add defensive check for API response structure
        if (!hookCompletion || !hookCompletion.choices || !hookCompletion.choices[0] || 
            !hookCompletion.choices[0].message || !hookCompletion.choices[0].message.content) {
          console.error('Invalid API response structure:', JSON.stringify(hookCompletion));
          throw new Error('Failed to generate hook: Invalid API response structure');
        }

        const generatedHook = hookCompletion.choices[0].message.content
          .replace(/["']/g, '') // Remove quotes
          .replace(/^\s*[Hh]ook:\s*/, '') // Remove any "Hook:" prefix
          .trim();

        console.log('Generated hook:', generatedHook);

        res.json({
          success: true,
          hook: generatedHook,
          topic: selectedTopic
        });
        return;
      } catch (apiError) {
        console.error('OpenRouter API Error (hook generation):', apiError);
        throw new Error('Failed to generate hook: ' + (apiError.error?.message || apiError.message));
      }
    }
    
    // ROUTE 2: Generate script from an existing hook
    else if (customHook && customHook.trim() !== '') {
      console.log(`Generating script from provided hook: ${customHook}`);

      try {
        const storyCompletion = await openrouterClient.chat.completions.create({
          model: openrouterModel,
          messages: [
            {
              role: "system",
              content: openrouterSystemPrompt
            },
            {
              role: "user",
              content: customHook
            }
          ],
          temperature: 0.7,
          max_tokens: 2000 // Explicitly set max tokens for script generation
        });

        // Add defensive check for API response structure
        if (!storyCompletion || !storyCompletion.choices || !storyCompletion.choices[0] || 
            !storyCompletion.choices[0].message || !storyCompletion.choices[0].message.content) {
          console.error('Invalid API response structure:', JSON.stringify(storyCompletion));
          throw new Error('Failed to generate script: Invalid API response structure');
        }

        const claudeResponse = storyCompletion.choices[0].message.content;

        // Check if the response contains both Hook and Story sections
        const scriptCompletion = claudeResponse.match(/Story:\s*\n(.*?)$/s);
        
        // If the response doesn't have proper formatting, extract just the story part
        let script;
        if (!scriptCompletion) {
          // If there's no proper formatting, use the entire response as the script
          script = claudeResponse.trim();
        } else {
          script = scriptCompletion[1].trim();
        }

        // Return the original hook and generated script
        res.json({
          success: true,
          hook: customHook,
          script: cleanText(script)
        });
        return;
      } catch (apiError) {
        console.error('OpenRouter API Error (script generation):', apiError);
        throw new Error('Failed to generate script from hook: ' + (apiError.error?.message || apiError.message));
      }
    }
    
    // Error: Not enough information provided
    else {
      return res.status(400).json({
        success: false,
        error: 'You must either request a hook (hookOnly=true) or provide a custom hook to generate a script.'
      });
    }
  } catch (error) {
    console.error('Script generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- Add Health Check Endpoint (BEFORE Catch-all) ---
app.get('/api/health', (req, res) => {
  res.sendStatus(200); // Send OK status
});
// --- End Health Check Endpoint ---

// Increase Remotion timeout to 10 minutes
process.env.REMOTION_TIMEOUT = '600000'; // 10 minutes

// --- Add Catch-all for Frontend Routing LAST ---
// This should come after ALL other specific static routes and API routes.
app.get('*', (req, res, next) => {
  // If the request is for an API endpoint or a file with an extension (already handled by static), skip
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next(); // Skip to next middleware (likely a 404 handler)
  }
  // Serve the main HTML file for client-side routing
  res.sendFile(path.join(__frontendDist, 'index.html'), (err) => {
    if (err) {
      console.error("Error sending index.html:", err);
      res.status(500).send(err);
    }
  });
});
// --- End Catch-all for Frontend Routing ---

// Start the server
const PORT = process.env.PORT || 3004;

// Pre-initialize Lambda on startup if credentials are available
if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  console.log('Pre-initializing Lambda...');
  initializeLambda()
    .then((func) => {
      if (func && func.functionName) { // Check if func is valid
        console.log(`Lambda function initialized: ${func.functionName}`);
      } else {
        console.warn('Lambda initialization finished, but function details seem incomplete.');
      }
      
      // Start server after attempting Lambda initialization
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT} with Lambda initialized.`);
        console.log(`Serving frontend from: ${__frontendDist}`);
      });
    })
    .catch((error) => {
      console.error('Failed to initialize Lambda:', error);
      // Start server even if Lambda initialization fails
      app.listen(PORT, '0.0.0.0', () => {
        console.warn(`Server running on http://0.0.0.0:${PORT} WITHOUT successful Lambda initialization due to error.`);
        console.log(`Serving frontend from: ${__frontendDist}`);
      });
    });
} else {
  console.warn('AWS credentials not found. Lambda rendering will not be available.');
  // Start server without attempting Lambda initialization
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} without Lambda (AWS credentials missing).`);
    console.log(`Serving frontend from: ${__frontendDist}`);
  });
}

// Add endpoint to update from GitHub
app.post('/api/update-from-github', async (req, res) => {
  try {
    console.log('Updating from GitHub...');
    
    // Get the current directory
    const currentDir = process.cwd();
    console.log(`Current directory: ${currentDir}`);
    
    // Navigate to the project root (one level up from backend)
    const projectRoot = path.resolve(currentDir, '..');
    console.log(`Project root: ${projectRoot}`);
    
    // Execute git pull command
    const { stdout, stderr } = await execAsync('git pull', { cwd: projectRoot });
    
    console.log('Git pull stdout:', stdout);
    if (stderr) console.log('Git pull stderr:', stderr);
    
    // Check if there were any updates
    if (stdout.includes('Already up to date.')) {
      return res.json({
        success: true,
        message: 'Already up to date. No changes were pulled.',
        updated: false
      });
    }
    
    // Return success response with update details
    res.json({
      success: true,
      message: 'Successfully updated from GitHub',
      details: stdout,
      updated: true
    });
  } catch (error) {
    console.error('Error updating from GitHub:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while updating from GitHub'
    });
  }
}); 