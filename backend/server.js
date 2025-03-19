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
  getSites
} from '@remotion/lambda';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ElevenLabsClient } from "elevenlabs";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

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

// Store the bucket name returned by getOrCreateBucket
let remotionBucketName = null;

// Function to initialize Lambda (deploy function and site)
let remotionFunction = null;
let remotionSite = null;
const SITE_NAME = 'reddit-clipper-production-site';

const initializeLambda = async () => {
  try {
    console.log('Initializing Lambda with params:', {
      region: AWS_REGION,
      timeout: LAMBDA_TIMEOUT,
      memory: LAMBDA_MEMORY_SIZE
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
app.use(cors());
app.use(express.json());
app.use('/videos', express.static(path.join(__dirname, 'public/videos')));
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/assets', express.static(path.join(__dirname, 'remotion/assets'), {
  setHeaders: (res, path) => {
    // Set caching headers
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Set content type for video files
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
  }
}));

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

// Function to generate audio using ElevenLabs API
async function generateAudio(text, apiKey, voiceId, modelId) {
  try {
    console.log(`Generating audio for text: "${text.substring(0, 30)}..." with voice ID: ${voiceId}`);
    console.log(`Model ID: ${modelId}`);
    
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: 0.9,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }

    console.log('Audio generated successfully');
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

// Function to get audio duration using ffmpeg
async function getAudioDuration(filePath) {
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    const durationInSeconds = parseFloat(stdout);
    
    // Convert seconds to HH:MM:SS format
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);
    const milliseconds = Math.floor((durationInSeconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error getting audio duration:', error);
    return 'unknown';
  }
}

// Function to get audio sample rate using ffmpeg
async function getAudioSampleRate(filePath) {
    const { stdout } = await execAsync(`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    return parseInt(stdout.trim());
}

// Function to process audio: remove silences and speed up
async function processAudio(inputPath, outputPath, speedFactor = 1.2, pitchUp = false, isHook = true, targetDuration = null) {
  console.log('Processing audio with parameters:', {
      inputPath,
      outputPath,
      speedFactor,
      pitchUp,
      isHook,
      targetDuration
  });

  // 1. Normalize audio
  console.log('Step 1: Normalizing audio');
  const normalizedAudio = outputPath + '.normalized.wav';
  await execAsync(`ffmpeg -i "${inputPath}" -af "volume=1.5" "${normalizedAudio}"`);
  
  try {
      // Get the base sample rate and duration of the input audio
      const baseRate = await getAudioSampleRate(normalizedAudio);
      const { stdout: durationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${normalizedAudio}"`);
      const currentDuration = parseFloat(durationStdout);
      
      console.log(`Original audio stats:`, {
          sampleRate: baseRate,
          duration: currentDuration,
          targetDuration: targetDuration
      });

      // Define silence removal threshold and create the filter
      const silence_threshold_db = -35;
      const silence_filter = (
          `silenceremove=start_periods=1:start_duration=0:`+
          `start_threshold=${silence_threshold_db}dB:detection=peak,`+
          `silenceremove=stop_periods=-1:stop_duration=0:`+
          `stop_threshold=${silence_threshold_db}dB:detection=peak`
      );
      
      if (pitchUp) {
          // First remove silences regardless of hook or script
          const silenceRemovedTemp = outputPath + '.silence-removed.wav';
          await execAsync(`ffmpeg -i "${normalizedAudio}" -af "${silence_filter}" -y "${silenceRemovedTemp}"`);
          
          // Get duration after silence removal
          const { stdout: silenceDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${silenceRemovedTemp}"`);
          const durationAfterSilence = parseFloat(silenceDurationStdout);
          
          // Calculate pitch and speed factors based on requirements
          let pitchFactor;
          let tempoFactor = 1.0; // Separate tempo from pitch
          
          if (isHook) {
              // Hook audio: use fixed factor for pitch 
              pitchFactor = 1.3;
              // No separate tempo adjustment needed for hook
          } else {
              // Script audio: calculate speed needed to match target duration
              if (targetDuration) {
                  // Calculate total speed factor needed to reach target duration
                  const totalSpeedFactor = durationAfterSilence / targetDuration;
                  
                  // When pitchUp is true, we want both the pitch and tempo to contribute to speed
                  // Use the total speed factor as the pitch factor to get the chipmunk effect
                  pitchFactor = totalSpeedFactor;
                  
                  // No additional tempo adjustment needed, since the pitch change will handle speed
                  tempoFactor = 1.0;
                  
                  // Ensure pitch factor is within reasonable limits
                  pitchFactor = Math.max(1.0, Math.min(2.0, pitchFactor));
                  
                  console.log(`Script audio adjustments:`, {
                      originalDuration: currentDuration,
                      durationAfterSilence: durationAfterSilence,
                      targetDuration: targetDuration,
                      pitchFactor: pitchFactor,
                      tempoFactor: tempoFactor,
                      expectedFinalDuration: durationAfterSilence / pitchFactor
                  });
              } else {
                  // No target duration specified, use default speed factor
                  pitchFactor = speedFactor;
                  tempoFactor = 1.0;
              }
          }

          // Calculate the exact sample rate needed for pitch adjustment (like in the Python example)
          const newRate = Math.floor(baseRate * pitchFactor);
          
          console.log('Audio processing parameters:', {
              originalSampleRate: baseRate,
              newSampleRate: newRate,
              pitchFactor: pitchFactor,
              tempoFactor: tempoFactor,
              effectiveSpeedFactor: isHook ? pitchFactor : pitchFactor * tempoFactor,
              expectedDuration: isHook ? durationAfterSilence / pitchFactor : durationAfterSilence / (pitchFactor * tempoFactor),
              isHook: isHook
          });
          
          // Build the filter chain exactly as in the Python example
          let filterChain = [
              // First change the sample rate to affect pitch
              `asetrate=${newRate}`,
              // Then resample back to original rate while preserving the pitch change
              `aresample=${baseRate}`
          ];
          
          // Add tempo adjustment if needed
          if (tempoFactor !== 1.0) {
              filterChain.push(`atempo=${tempoFactor.toFixed(4)}`);
          }
          
          // Join the filter chain with commas (like in the Python example)
          const filterString = filterChain.join(',');
          
          // Apply the filter chain            
          await execAsync(`ffmpeg -i "${silenceRemovedTemp}" -filter:a "${filterString}" -ar ${baseRate} -y "${outputPath}"`);
          
          // Clean up temporary files
          await cleanupFiles([silenceRemovedTemp]);
          
          // Verify final duration
          const { stdout: finalDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);
          const finalDuration = parseFloat(finalDurationStdout);
          
          console.log('Final audio duration:', {
              targetDuration: targetDuration,
              actualDuration: finalDuration,
              difference: targetDuration ? Math.abs(finalDuration - targetDuration) : 0
          });
      } else {
          // When pitch up is false, use atempo for speed change only
          let effectiveSpeedFactor = speedFactor;
          
          // If silences need to be removed, do that first
          const silenceRemovedTemp = outputPath + '.silence-removed.wav';
          await execAsync(`ffmpeg -i "${normalizedAudio}" -af "${silence_filter}" -y "${silenceRemovedTemp}"`);
          
          // Get duration after silence removal
          const { stdout: silenceDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${silenceRemovedTemp}"`);
          const durationAfterSilence = parseFloat(silenceDurationStdout);
          
          // If target duration is specified, calculate required speed factor
          if (targetDuration) {
              // Calculate total speed factor needed to reach target duration
              effectiveSpeedFactor = durationAfterSilence / targetDuration;
              
              // Ensure speed factor is within reasonable limits
              effectiveSpeedFactor = Math.max(0.8, Math.min(2.0, effectiveSpeedFactor));
              
              console.log(`Calculated speed factor to match target duration: ${effectiveSpeedFactor}`);
          }
          
          // For normal speed changing, use high quality ATEMPO
          let atempoChain = "";
          let remainingSpeedFactor = effectiveSpeedFactor;
          
          // ATEMPO filter can only handle values between 0.5 and 2.0, so chain if needed
          while (remainingSpeedFactor > 2.0) {
              atempoChain += "atempo=2.0,";
              remainingSpeedFactor /= 2.0;
          }
          while (remainingSpeedFactor < 0.5) {
              atempoChain += "atempo=0.5,";
              remainingSpeedFactor *= 2.0;
          }
          atempoChain += `atempo=${remainingSpeedFactor.toFixed(4)}`;
          
          // Apply speed adjustment to the silence-removed audio
          await execAsync(`ffmpeg -i "${silenceRemovedTemp}" -af "${atempoChain}" -y "${outputPath}"`);
          
          // Clean up temp file
          await cleanupFiles([silenceRemovedTemp]);
          
          // Verify final duration
          const { stdout: finalDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);
          const finalDuration = parseFloat(finalDurationStdout);
          
          console.log('Final audio duration:', {
              targetDuration: targetDuration,
              actualDuration: finalDuration,
              difference: targetDuration ? Math.abs(finalDuration - targetDuration) : 0
          });
      }
  } catch (error) {
      console.error('Error processing audio:', error);
      throw error;
  } finally {
      // Clean up intermediate files
      await cleanupFiles([normalizedAudio]);
  }
}

// Function to clean up files
async function cleanupFiles(files) {
for (const file of files) {
  try {
    if (fs.existsSync(file)) {
      await fs.promises.unlink(file);
      console.log(`Cleaned up file: ${file}`);
    }
  } catch (error) {
    console.error(`Error cleaning up file ${file}:`, error);
  }
}
}


// Function to transcribe audio and get word-level timestamps
async function transcribeAudio(audioPath, elevenlabsApiKey, openaiApiKey, channelStyle = 'grouped', openrouterApiKey = null, openrouterModel = null) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  
  // Validate API keys at the beginning
  if (!elevenlabsApiKey || elevenlabsApiKey.trim() === '') {
    console.error('ElevenLabs API key is missing or empty');
    throw new Error('ElevenLabs API key is required for transcription');
  }
  
  const hasOpenAI = openaiApiKey && openaiApiKey.trim() !== '';
  const hasOpenRouter = openrouterApiKey && openrouterApiKey.trim() !== '';
  
  if (!hasOpenAI && !hasOpenRouter) {
    console.warn('Neither OpenAI nor OpenRouter API key is available - color analysis will be skipped');
    // We'll continue without OpenAI/OpenRouter API key, but color analysis will be skipped
  } else if (hasOpenAI) {
    console.log('OpenAI API key is present for color analysis');
  } else {
    console.log('OpenRouter API key is present for color analysis');
  }
  
  // Helper function to process transcription response
  function processTranscriptionResponse(response) {
    // Write raw transcription to file
    // const timestamp = Date.now();
    // const rawTranscriptionPath = path.join(transcriptionsDir, `raw_transcription_${timestamp}.json`);
    // fs.writeFileSync(rawTranscriptionPath, JSON.stringify(response, null, 2));
    // console.log(`Raw transcription saved to: ${rawTranscriptionPath}`

    // Save the transcribed text for potential fallback use
    // const scriptTextPath = path.join(transcriptionsDir, 'script_text.txt');
    // fs.writeFileSync(scriptTextPath, response.text, 'utf8');
    // filesToCleanup.push(scriptTextPath);
    
    // Process the words from the response
    const fps = 30;
    const processedWords = [];
    
    // Calculate frames for each word
    for (let i = 0; i < response.words.length; i++) {
      const word = response.words[i];
      const startFrame = Math.round(word.start * fps);
      const endFrame = Math.round(word.end * fps);
      
      processedWords.push({
        text: word.text,
        startFrame,
        endFrame,
        color: 'white' // Default color, will be updated later
      });
    }
    
    return processedWords;
  }
  
  // Helper function to create fallback word timings
  async function createFallbackWordTimings(audioPath, text, channelStyle) {
    console.log('Creating fallback word timings...');
    
    // Get audio duration
    const { stdout: durationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
    const durationInSeconds = parseFloat(durationStdout);
    
    // Split text into words or word groups
    let words;
    if (channelStyle === 'single') {
      words = text.split(' ').filter(word => word.trim() !== '');
    } else {
      // For grouped style, create groups of 2-4 words
      const allWords = text.split(' ').filter(word => word.trim() !== '');
      words = [];
      let currentGroup = '';
      let wordCount = 0;
      
      for (const word of allWords) {
        if (wordCount === 0) {
          currentGroup = word;
          wordCount = 1;
        } else if (wordCount < 3) {
          currentGroup += ' ' + word;
          wordCount++;
        } else {
          words.push(currentGroup);
          currentGroup = word;
          wordCount = 1;
        }
      }
      
      if (currentGroup) {
        words.push(currentGroup);
      }
    }
    
    // Calculate frames per word
    const fps = 30;
    const totalFrames = Math.ceil(durationInSeconds * fps);
    const framesPerWord = Math.floor(totalFrames / words.length);
    
    // Create evenly spaced word timings
    const processedWords = [];
    for (let i = 0; i < words.length; i++) {
      const startFrame = i * framesPerWord;
      const endFrame = (i === words.length - 1) ? totalFrames : (i + 1) * framesPerWord;
      
      processedWords.push({
        text: words[i],
        startFrame,
        endFrame,
        color: 'white' // Default color for fallback
      });
    }
    
    console.log(`Created fallback timings for ${processedWords.length} words`);
    return processedWords;
  }
  
  // Try to get transcription with retries using direct fetch approach
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Transcription attempt ${attempt}/${MAX_RETRIES} using direct fetch approach...`);
      
      // Validate the audio file before sending
      try {
        const stats = fs.statSync(audioPath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        console.log(`Audio file size: ${fileSizeInMB.toFixed(2)} MB`);
        
        // Check if file exists and is not too large
        if (!stats.isFile()) {
          throw new Error(`Not a valid file: ${audioPath}`);
        }
        
        // ElevenLabs has a file size limit (check their docs for exact limit)
        if (fileSizeInMB > 25) {
          console.warn(`File size (${fileSizeInMB.toFixed(2)} MB) may exceed ElevenLabs limits`);
        }
        
        // Check file format using ffprobe
        const { stdout: formatInfo } = await execAsync(`ffprobe -v error -show_entries format=format_name -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
        console.log(`Audio format: ${formatInfo.trim()}`);
        
        // ElevenLabs supports MP3, WAV, etc. - check if format is supported
        const supportedFormats = ['mp3', 'wav', 'mp4', 'm4a', 'webm'];
        const detectedFormat = formatInfo.trim().split(',')[0]; // Get the first format if multiple are detected
        
        if (!supportedFormats.includes(detectedFormat)) {
          console.warn(`Audio format ${detectedFormat} may not be supported by ElevenLabs`);
        }
      } catch (validationError) {
        console.error(`File validation error: ${validationError.message}`);
        throw validationError;
      }
      
      // Read the file into a buffer
      const fileBuffer = fs.readFileSync(audioPath);
      
      // Create a FormData object for the file
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: path.basename(audioPath),
        contentType: 'audio/mpeg', // Adjust based on file type
      });
      formData.append('model_id', 'scribe_v1');
      
      // Make direct fetch request to ElevenLabs API
      const directResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenlabsApiKey,
          ...formData.getHeaders()
        },
        body: formData,
        timeout: 60000 // 60 seconds
      });
      
      if (!directResponse.ok) {
        throw new Error(`Direct API request failed with status: ${directResponse.status}`);
      }
      
      const directData = await directResponse.json();
      console.log("Direct fetch approach succeeded!");
      
      // Process the response
      if (!directData || !directData.text || !directData.words || directData.words.length === 0) {
        throw new Error('Invalid response from direct API call');
      }
      
      // Process the transcription response
      const processedWords = processTranscriptionResponse(directData);
      
      // Skip color analysis if OpenAI API key is missing
      if (!openaiApiKey && !openrouterApiKey) {
        console.warn('Skipping color analysis due to missing API keys');
        
        // Write processed transcription to file with default colors (all white)
        // const timestamp = Date.now();
        // const processedTranscriptionPath = path.join(transcriptionsDir, `processed_transcription_${timestamp}.json`);
        // fs.writeFileSync(processedTranscriptionPath, JSON.stringify({
        //   words: processedWords,
        //   colorAssignments: processedWords.map(word => ({ word: word.text, color: 'white' })),
        //   channelStyle
        // }, null, 2));
        
        console.log(`Transcribed into ${processedWords.length} words (all white due to missing API keys)`);
        return processedWords;
      }
      
      // Analyze text for important words using OpenAI or OpenRouter API
      console.log('Analyzing text for word importance...');
      const systemPrompt = channelStyle === 'single' 
        ? `You are a text analyzer that identifies important words and phrases in text and assigns them colors. You must put a focus on coloring phrases rather than single words.
            Rules:
            1. The vast majority of words should remain white (default)
            2. Key phrases or words crucial to the meaning should be yellow (can be multiple consecutive words)
            3. Action phrases or dramatic emphasis should be red (can be multiple consecutive words)
            4. Positive/successful phrases should be green (can be multiple consecutive words)
            5. Special/unique/rare phrases should be purple (can be multiple consecutive words)
            6. Only color truly important words/phrases - most should stay white
            7. When coloring multiple consecutive words as a phrase, each word in the phrase should get the same color
            8. Return ONLY a JSON array with each word and its color, DO NOT RETURN ANYTHING ELSE
            9. DO NOT write your response in markdown, just return the JSON array.
            10. The JSON array should be in the format: [{"word": "word", "color": "color"}, {"word": "word", "color": "color"}]
            11. Each word should be a separate entry in the array, even if part of a colored phrase`
        : `You are a text analyzer that identifies important words in text and assigns them colors.
            Rules:
            1. The vast majority of words should remain white (default)
            2. Key words that are crucial to the meaning should be yellow
            3. Action words or dramatic emphasis should be red
            4. Positive/successful words should be green
            5. Special/unique/rare words should be purple
            6. Only color truly important words - most should stay white
            7. Return ONLY a JSON array with each word and its color, DO NOT RETURN ANYTHING ELSE
            8. DO NOT write your response in markdown, just return the JSON array.
            9. The JSON array should be in the format: [{"word": "word", "color": "color"}, {"word": "word", "color": "color"}]`;

      let colorAssignments = [];
      let apiSuccess = false;
      
      // Define models to try in order of preference
      const openaiModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      let currentModelIndex = 0;
      
      // Try to get color analysis with retries
      for (let colorAttempt = 1; colorAttempt <= MAX_RETRIES; colorAttempt++) {
        try {
          // If we've tried all models, reset to the first one
          if (currentModelIndex >= openaiModels.length) {
            currentModelIndex = 0;
          }
          
          const currentModel = openaiModels[currentModelIndex];
          console.log(`Color analysis attempt ${colorAttempt}/${MAX_RETRIES} using model: ${currentModel}...`);
          
          let importanceResponse;
          if (hasOpenAI) {
            importanceResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: currentModel,
                messages: [
                  {
                    role: "system",
                    content: systemPrompt
                  },
                  {
                    role: "user",
                    content: `Analyze this text and return a JSON array where each word has a color (white, yellow, red, green, or purple). Text: "${directData.text}"`
                  }
                ],
                temperature: 0.3
              })
            });
          } else if (hasOpenRouter) {
            importanceResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openrouterApiKey}`
              },
              body: JSON.stringify({
                model: openrouterModel,
                messages: [
                  {
                    role: "system",
                    content: systemPrompt
                  },
                  {
                    role: "user",
                    content: `Analyze this text and return a JSON array where each word has a color (white, yellow, red, green, or purple). Text: "${directData.text}"`
                  }
                ],
                temperature: 0.3
              })
            });
          } else {
            throw new Error('Neither OpenAI nor OpenRouter API key is available');
          }

          // Log the response status
          console.log(`API response status: ${importanceResponse.status}`);
          
          if (!importanceResponse.ok) {
            const errorText = await importanceResponse.text();
            throw new Error(`API returned status ${importanceResponse.status}: ${errorText}`);
          }

          const importanceData = await importanceResponse.json();
          
          // Log the response structure
          console.log(`API response received with ${importanceData.choices ? importanceData.choices.length : 0} choices`);
          
          if (!importanceData || !importanceData.choices || !importanceData.choices[0] || !importanceData.choices[0].message || !importanceData.choices[0].message.content) {
            console.error('Invalid API response structure:', JSON.stringify(importanceData));
            throw new Error('Invalid response from API');
          }
          
          try {
            // Log the raw content before parsing
            const rawContent = importanceData.choices[0].message.content;
            console.log(`API raw response content (first 100 chars): ${rawContent.substring(0, 100)}...`);
            
            colorAssignments = JSON.parse(rawContent);
            apiSuccess = true;
            console.log(`Color analysis completed successfully with ${colorAssignments.length} color assignments`);
            break;
          } catch (parseError) {
            console.error('Failed to parse API response content:', importanceData.choices[0].message.content);
            throw new Error(`Failed to parse API response: ${parseError.message}`);
          }
        } catch (colorError) {
          console.error(`Color analysis attempt ${colorAttempt} failed: ${colorError.message}`);
          console.error(colorError.stack);
          
          if (colorAttempt < MAX_RETRIES) {
            // Try the next model in the list
            currentModelIndex++;
            console.log(`Switching to next model for retry...`);
            
            console.log(`Waiting ${RETRY_DELAY/1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          } else {
            console.warn('All color analysis attempts failed, using default colors');
            // Create default color assignments (all white)
            const words = directData.text.split(' ');
            colorAssignments = words.map(word => ({ word, color: 'white' }));
          }
        }
      }

      // Create a map of words to their colors for easy lookup
      const wordColorMap = new Map();
      colorAssignments.forEach(item => {
        wordColorMap.set(item.word.toLowerCase(), item.color);
      });
      
      // Apply colors to the processed words
      for (const word of processedWords) {
        word.color = wordColorMap.get(word.text.toLowerCase()) || 'white';
      }
      
      // Write processed transcription to file
      // const timestamp = Date.now();
      // const processedTranscriptionPath = path.join(transcriptionsDir, `processed_transcription_${timestamp}.json`);
      // fs.writeFileSync(processedTranscriptionPath, JSON.stringify({
      //   words: processedWords,
      //   colorAssignments,
      //   channelStyle
      // }, null, 2));
      // console.log(`Processed transcription saved to: ${processedTranscriptionPath}`);
      
      console.log(`Transcribed into ${processedWords.length} words with colors`);
      
      return processedWords;
      
    } catch (error) {
      console.error(`Transcription attempt ${attempt} failed with error: ${error.message}`);
      console.error(error.stack);
      
      if (attempt < MAX_RETRIES) {
        console.log(`Waiting ${RETRY_DELAY/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.warn('All transcription attempts failed, using fallback method');
        // Get the script text from the audio file name
        const audioFileName = path.basename(audioPath);
        const scriptText = audioFileName.includes('script') ? 
          fs.existsSync(path.join(transcriptionsDir, 'script_text.txt')) ? 
            fs.readFileSync(path.join(transcriptionsDir, 'script_text.txt'), 'utf8') : 
            'Script text not available' : 
          'Audio content';
        
        return await createFallbackWordTimings(audioPath, scriptText, channelStyle);
      }
    }
  }
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
async function renderHookVideo(hookAudioPath, scriptAudioPath, channelName, channelImageUrl, hookText, scriptText, outputPath, openaiApiKey, elevenlabsApiKey, channelStyle = 'grouped', font = 'Jellee', fontUrl = null, has_background_music = false, subtitle_size = 64, stroke_size = 8, res, filesToCleanup, background_video_type = 'gameplay', userId, timestamp, openrouterApiKey = null, openrouterModel = null) {
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
    
    // 5. Upload small video assets for HookVideo component
    console.log('Uploading small video assets for HookVideo component...');
    const smallVideoAssets = {};
    const smallVideoFrames = {};
    
    // Log progress updates to client
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'uploading_assets',
      progress: 70
    }) + '\n\n');
    
    // Upload video files
    for (let i = 1; i <= 6; i++) {
      try {
        console.log(`Uploading small video ${i} to S3...`);
        const videoPath = path.join(__dirname, `remotion/assets/videos/${i}.mp4`);
        if (!fs.existsSync(videoPath)) {
          console.warn(`Small video file not found: ${videoPath}`);
          continue;
        }
        
        const videoS3Key = `videos/small/${userId}/${timestamp}-video-${i}.mp4`;
        const videoS3Url = await uploadToS3(videoPath, videoS3Key);
        smallVideoAssets[`video${i}`] = videoS3Url;
        s3Assets.push(videoS3Key);
        console.log(`Successfully uploaded small video ${i} to S3: ${videoS3Url}`);
      } catch (videoError) {
        console.error(`Error uploading small video ${i} to S3: ${videoError.message}`);
        // Continue without this video
      }
      
      // Upload frame images as fallbacks
      try {
        console.log(`Uploading frame ${i} to S3...`);
        const framePath = path.join(__dirname, `remotion/assets/videos/frames/${i}.jpg`);
        if (!fs.existsSync(framePath)) {
          console.warn(`Frame file not found: ${framePath}`);
          continue;
        }
        
        const frameS3Key = `videos/frames/${userId}/${timestamp}-frame-${i}.jpg`;
        const frameS3Url = await uploadToS3(framePath, frameS3Key);
        smallVideoFrames[`frame${i}`] = frameS3Url;
        s3Assets.push(frameS3Key);
        console.log(`Successfully uploaded frame ${i} to S3: ${frameS3Url}`);
      } catch (frameError) {
        console.error(`Error uploading frame ${i} to S3: ${frameError.message}`);
        // Continue without this frame
      }
      
      // Update progress
      res.write(JSON.stringify({
        type: 'status_update',
        status: 'uploading_assets',
        progress: 70 + Math.floor((i / 6) * 10)
      }) + '\n\n');
    }
    
    // Upload other UI assets
    console.log('Uploading UI assets for HookVideo component...');
    let badgeUrl, bubbleUrl, shareUrl;
    try {
      const badgePath = path.join(__dirname, 'remotion/assets/badge.png');
      if (fs.existsSync(badgePath)) {
        const badgeS3Key = `assets/${userId}/${timestamp}-badge.png`;
        badgeUrl = await uploadToS3(badgePath, badgeS3Key);
        s3Assets.push(badgeS3Key);
        console.log(`Successfully uploaded badge asset to S3: ${badgeUrl}`);
      } else {
        console.warn('Badge asset not found:', badgePath);
      }
      
      const bubblePath = path.join(__dirname, 'remotion/assets/bubble.svg');
      if (fs.existsSync(bubblePath)) {
        const bubbleS3Key = `assets/${userId}/${timestamp}-bubble.svg`;
        bubbleUrl = await uploadToS3(bubblePath, bubbleS3Key);
        s3Assets.push(bubbleS3Key);
        console.log(`Successfully uploaded bubble asset to S3: ${bubbleUrl}`);
      } else {
        console.warn('Bubble asset not found:', bubblePath);
      }
      
      const sharePath = path.join(__dirname, 'remotion/assets/share.svg');
      if (fs.existsSync(sharePath)) {
        const shareS3Key = `assets/${userId}/${timestamp}-share.svg`;
        shareUrl = await uploadToS3(sharePath, shareS3Key);
        s3Assets.push(shareS3Key);
        console.log(`Successfully uploaded share asset to S3: ${shareUrl}`);
      } else {
        console.warn('Share asset not found:', sharePath);
      }
    } catch (assetError) {
      console.error(`Error uploading UI assets to S3: ${assetError.message}`);
      // Continue without UI assets
    }
    
    // Print summary of all assets
    console.log('Summary of uploaded assets:');
    console.log('Videos:', smallVideoAssets);
    console.log('Frames:', smallVideoFrames);
    console.log('UI assets:', { badgeUrl, bubbleUrl, shareUrl });
    
    // Prepare input props for Remotion Lambda
    const inputProps = {
      channelName,
      channelImage: channelImageS3Url,
      hookText,
      audioUrl: hookAudioUrl,
      audioDurationInSeconds: hookDurationInSeconds,
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
      // Add assetUrls for HookVideo component
      assetUrls: {
        badge: badgeUrl,
        bubble: bubbleUrl,
        share: shareUrl,
        frames: smallVideoFrames,
        videos: smallVideoAssets
      }
    };
    
    console.log('Remotion input props prepared:', {
      font,
      fontUrl: fontS3Url,
      totalDurationInFrames: totalFrames
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
    
    // Import the getRenderProgress function (correct name from docs)
    const { getRenderProgress } = await import('@remotion/lambda/client');
    
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
        
        // Get the current render progress using the correct function
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
      // Import the downloadMedia function from the correct package
      const { downloadMedia } = await import('@remotion/lambda');
      
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
        // Import the cancelRendering function from the correct location
        const { cancelRendering } = await import('@remotion/lambda');
        await cancelRendering({
          renderId: renderResponse.renderId,
          functionName: remotionFunction.functionName,
          region: AWS_REGION,
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        });
        console.log('Lambda render cancelled successfully');
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
    const { userId, elevenlabsApiKey, elevenlabsVoiceModel, openaiApiKey, openrouterApiKey, openrouterModel, otherSettings } = req.body;
    
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
      pitch_up = false
    } = req.body;

    console.log('Received request with userId:', userId);
    console.log('useUserSettings:', useUserSettings);
    console.log('Channel font:', channelFont);
    console.log('Pitch up enabled:', pitch_up);
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
        openrouterModel
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
    const { openrouterApiKey, openrouterModel, customHook, hookOnly } = req.body;

    console.log('Received request with OpenRouter API key:', openrouterApiKey);
    console.log('Received request with OpenRouter model:', openrouterModel);
    console.log('Received request with custom hook:', customHook);
    console.log('Hook only mode:', hookOnly);

    // Validate OpenRouter API key
    if (!openrouterApiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing OpenRouter API key.'
      });
    }

    // Get OpenRouter client with the provided API key
    const openrouterClient = getOpenRouterClient(openrouterApiKey);
    
    // System prompt for story generation
    const openrouterSystemPrompt = `## Story Generation System Prompt for Comedic Justice Tales

## CORE PARAMETERS
- **Total Length:** The story should be MINIMUM 360 words in length.
- **Hook:** Maximum 10 words, phrased as a question
- **Format:** Plain text only
- **Dialogue** Less than 5 lines of dialogue total that are brief sentences.

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
- No extended reflection or aftermath after the payoff
- The first sentence of the SETUP step must be designed to draw interest from the reader so they are compelled to keep reading.

---

## RESPONSE FORMAT EXAMPLE

Hook:
[Question that sets up premise in 10 words or less]

Story:
[Body of the story following the structure above]


When given a hook or topic, I will generate a complete story following these exact guidelines, maintaining the specified tone, structure, and satisfying payoff ending.`;

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

        // Generate hook using OpenRouter
        const hookCompletion = await openrouterClient.chat.completions.create({
          model: openrouterModel,
          messages: [
            {
              role: "system",
              content: `### System Instructions for Viral Reddit Questions  

              You are an expert at crafting **highly engaging, storytelling-style Reddit questions** that spark **funny, awkward, or bizarre** personal stories.  
              
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
              5. **Trigger a strong reaction** – The best questions make people **laugh, cringe, or instantly remember a story.**
              6. **Include family perspectives** – Make at least 40% of questions target specific family roles (dads, moms, sons, daughters, siblings).
              7. **TRUE DIVERSITY** – If asked for multiple questions, each one must be COMPLETELY DIFFERENT from the last in both topic and structure.
              
              ---
              
              ### **Output Format:**  
              A **single, engaging Reddit-style question** that follows these rules and keeps **structure variety.** and **no asterisks!** or markdown formatting. Just plain text.`
            },
            {
              role: "user",
              content: `Totally new question:`
            }
          ],
          temperature: 1,
          max_tokens: 40
        });

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
          temperature: 1
        });

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

// Increase Remotion timeout to 10 minutes
process.env.REMOTION_TIMEOUT = '600000'; // 10 minutes

const PORT = process.env.PORT || 3004;
app.listen(PORT, 'localhost', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Audio files will be available at: http://localhost:${PORT}/audio/`);
  console.log(`Images will be available at: http://localhost:${PORT}/images/`);
  
  // Pre-initialize Lambda on startup if credentials are available
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    console.log('Pre-initializing Lambda...');
    initializeLambda()
      .then((func) => {
        console.log(`Lambda function initialized: ${func.functionName}`);
        
        // Verify bucket name format
        if (!remotionBucketName.startsWith('remotionlambda-')) {
          console.warn(`Warning: Bucket name ${remotionBucketName} does not start with remotionlambda-. This may cause issues.`);
        }
      })
      .catch((error) => {
        console.error('Failed to initialize Lambda:', error);
      });
  } else {
    console.warn('AWS credentials not found. Lambda rendering will not be available.');
  }
}); 

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