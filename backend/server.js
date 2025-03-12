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
async function processAudio(inputPath, outputPath, speedFactor = 1.25, pitchUp = false, isHook = true, targetDuration = null) {
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
                pitchFactor = 1.4;
                // No separate tempo adjustment needed for hook
            } else {
                // Script audio: use fixed pitch factor of 1.3 and adjust tempo separately
                pitchFactor = 1.3; // Fixed pitch factor for script audio
                
                // Calculate tempo factor based on target duration if specified
                if (targetDuration) {
                    // Calculate total speed factor needed to reach target duration
                    const totalSpeedFactor = durationAfterSilence / targetDuration;
                    
                    // Since pitch is now fixed, we need to adjust tempo to meet the target duration
                    // The formula accounts for the fact that pitch change already affects duration
                    tempoFactor = totalSpeedFactor / pitchFactor;
                    
                    // Ensure tempo factor is within reasonable limits
                    tempoFactor = Math.max(0.5, Math.min(2.0, tempoFactor));
                    
                    console.log(`Script audio adjustments:`, {
                        originalDuration: currentDuration,
                        durationAfterSilence: durationAfterSilence,
                        targetDuration: targetDuration,
                        pitchFactor: pitchFactor, // Fixed at 1.3
                        tempoFactor: tempoFactor,
                        expectedFinalDuration: durationAfterSilence / (pitchFactor * tempoFactor)
                    });
                } else {
                    // No target duration specified, use default speed factor for tempo
                    tempoFactor = speedFactor / pitchFactor; // Adjust tempo to achieve desired speed
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

// Function to render hook video using Remotion
async function renderHookVideo(hookAudioPath, scriptAudioPath, channelName, channelImageUrl, hookText, scriptText, outputPath, openaiApiKey, elevenlabsApiKey, channelStyle = 'grouped', font = 'Jellee', fontUrl = null, has_background_music = false, subtitle_size = 64, stroke_size = 8, res, filesToCleanup, background_video_type = 'gameplay', userId, timestamp, openrouterApiKey = null, openrouterModel = null) {
  let isProcessComplete = false; // Add variable declaration
  try {
    console.log('Starting video generation process...');
    console.log(`Using channel style: ${channelStyle}`);
    console.log(`Using font: ${font}`);
    console.log(`Background music enabled: ${has_background_music}`);
    
    // Get hook audio duration in frames (assuming 30fps)
    const { stdout: hookDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${hookAudioPath}"`);
    const hookDurationInSeconds = parseFloat(hookDurationStdout);
    
    // Get script audio duration
    const { stdout: scriptDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${scriptAudioPath}"`);
    const scriptDurationInSeconds = parseFloat(scriptDurationStdout);

    // Calculate total required duration
    const totalDurationInSeconds = hookDurationInSeconds + scriptDurationInSeconds;
    
    // Save script text to file for potential fallback use
    // try {
    //   if (!fs.existsSync(transcriptionsDir)) {
    //     fs.mkdirSync(transcriptionsDir, { recursive: true });
    //   }
    //   fs.writeFileSync(path.join(transcriptionsDir, 'script_text.txt'), scriptText, 'utf8');
    //   console.log('Script text saved for fallback use');
    // } catch (saveError) {
    //   console.error('Error saving script text for fallback:', saveError);
    // }
    
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
    
    // Start video generation immediately after transcription
    console.log('Starting video generation...');
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'video_processing'
    }) + '\n\n');
    
    // Generate background video sequence
    const { videos, totalDurationInFrames } = await createBackgroundVideo(totalDurationInSeconds, background_video_type);
    console.log(`Background videos generated: ${videos.length} videos`);
    
    // Add background videos to cleanup list
    if (filesToCleanup) {
      videos.forEach(videoInfo => {
        const videoFileName = path.basename(videoInfo.path);
        const backgroundVideoLocalPath = path.join(__dirname, 'public', 'videos', videoFileName);
        if (fs.existsSync(backgroundVideoLocalPath)) {
          filesToCleanup.push(backgroundVideoLocalPath);
        }
      });
    }
    
    const fps = 30;
    const hookFrames = Math.ceil(hookDurationInSeconds * fps);
    const scriptFrames = Math.ceil(scriptDurationInSeconds * fps);
    const totalFrames = hookFrames + scriptFrames;
    
    // Convert local audio paths to HTTP URLs
    const hookAudioFileName = path.basename(hookAudioPath);
    const scriptAudioFileName = path.basename(scriptAudioPath);
    
    // Use the server's IP address instead of localhost
    const serverAddress = 'localhost:3004'; // Your machine's IP and port
    const hookAudioUrl = `http://${serverAddress}/audio/${hookAudioFileName}`;
    const scriptAudioUrl = `http://${serverAddress}/audio/${scriptAudioFileName}`;
    
    // Bundle the video
    console.log('Bundling Remotion components...');
    const bundled = await bundle(path.join(__dirname, 'remotion/index.tsx'));
    
    // Prepare input props for Remotion
    const inputProps = {
      channelName,
      channelImage: channelImageUrl,
      hookText,
      audioUrl: hookAudioUrl,
      audioDurationInSeconds: hookDurationInSeconds,
      subtitleText: scriptText,
      scriptAudioUrl: scriptAudioUrl,
      scriptAudioDurationInSeconds: scriptDurationInSeconds,
      wordTimings,
      totalDurationInFrames: Math.ceil(fps * (hookDurationInSeconds + scriptDurationInSeconds)),
      backgroundVideoPath: videos,
      channelStyle,
      font,
      fontUrl,
      has_background_music,
      subtitle_size,
      stroke_size
    };

    const compositions = await getCompositions(bundled, { inputProps });
    
    const composition = compositions.find((c) => c.id === 'MainComposition');
    
    if (!composition) {
      throw new Error('Could not find MainComposition');
    }

    // Now that we're ready to render the final video, send the video processing status
    console.log('Starting final video rendering...');
    res.write(JSON.stringify({
      type: 'status_update',
      status: 'video_processing'
    }) + '\n\n');
    
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      videoBitrate: '6M',
      durationInFrames: Math.ceil(fps * (hookDurationInSeconds + scriptDurationInSeconds)),
      fps: 30,
      width: 1080,
      height: 1920,
      timeoutInMilliseconds: 600000,
      pixelFormat: 'yuv420p',  // Consistent pixel format
      x264: {
        preset: 'slower',  // Better quality encoding
        profile: 'high',
        tune: 'animation',  // Optimize for animated content
      }
    });
    
    console.log('Video rendering completed successfully');
    
    // Upload video to Supabase storage
    console.log('Uploading video to Supabase storage...');
    const videoBuffer = fs.readFileSync(outputPath);
    const videoFileName = `${userId}/${timestamp}-video.mp4`;
    const { data: videoData, error: videoError } = await supabase.storage
      .from('videos')
      .upload(videoFileName, videoBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600'
      });

    if (videoError) throw videoError;

    // Get video URL
    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(videoFileName);

    // Generate thumbnail using ffmpeg - do this BEFORE cleaning up the video file
    console.log('Generating thumbnail...');
    const thumbnailPath = path.join(imagesDir, `thumbnail-${timestamp}.jpg`);
    await execAsync(`ffmpeg -i "${outputPath}" -ss 00:00:01 -frames:v 1 "${thumbnailPath}"`);

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
    await cleanupFiles([outputPath, thumbnailPath]);

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

    // Clean up all remaining temporary files immediately
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
    console.error('Error rendering video:', error);
    
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

// Modified generate-video endpoint to use cached settings
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

    // Process hook audio with fixed speed (1.2x) and remove silences
    console.log('Processing hook audio...');
    await processAudio(hookAudioRawPath, hookAudioProcessedPath, 1.2, pitch_up, true);
    
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
    const { openaiApiKey, openrouterApiKey, openrouterModel } = req.body;

    console.log('Received request with OpenAI API key:', openaiApiKey);
    console.log('Received request with OpenRouter API key:', openrouterApiKey);
    console.log('Received request with OpenRouter model:', openrouterModel);

    if (!openaiApiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing OpenAI API key.'
      });
    }

    // Get OpenAI client with the provided API key
    const client = getOpenAIClient(openaiApiKey);
    const systemPrompt = `You are tasked with creating a Reddit-style short story for YouTube Shorts.`;

    try {
      const completion = await client.chat.completions.create({
        model: 'ft:gpt-4o-mini-2024-07-18:personal:reddit-shorts-ft:B8nwnuGO',
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Write a full length story that is 350 words in length. The hook MUST be a MAXIMUM of 10 words in length. Only write in plaintext.

Return your response in the following format:

Hook:
<hook>

Story:
<story>`
          }
        ],
        temperature: 0.5
      });

      const generatedText = completion.choices[0].message.content;
      console.log('Generated Text:', generatedText);

      // Parse the hook and script from the generated text
      const hookMatch = generatedText.match(/Hook:\s*\n(.*?)(?=\n\nStory:)/s);
      const scriptMatch = generatedText.match(/Story:\s*\n(.*?)$/s);

      if (!hookMatch || !scriptMatch) {
        throw new Error('Failed to parse generated script format');
      }

      // Get OpenRouter client with the provided API key
      const openrouterClient = getOpenRouterClient(openrouterApiKey);
      const openrouterSystemPrompt = `## Story Generation System Prompt for Comedic Justice Tales

## CORE PARAMETERS
- **Total Length:** The story should be 330 words in length.
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

      const storyCompletion = await openrouterClient.chat.completions.create({
        model: openrouterModel,
        messages: [
          {
            role: "system",
            content: openrouterSystemPrompt
          },
          {
            role: "user",
            content: hookMatch[1]
          }
        ],
        temperature: 0.7
      });

      const claudeResponse = storyCompletion.choices[0].message.content;

      const hookCompletion = claudeResponse.match(/Hook:\s*\n(.*?)(?=\n\nStory:)/s);
      const scriptCompletion = claudeResponse.match(/Story:\s*\n(.*?)$/s);

      if (!hookCompletion || !scriptCompletion) {
        throw new Error('Failed to parse generated script format');
      }

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

      const hook = cleanText(hookMatch[1]);
      const script = cleanText(scriptCompletion[1]);

      res.json({
        success: true,
        hook,
        script
      });
    } catch (apiError) {
      console.error('OpenAI API Error:', apiError);
      
      // Handle specific OpenAI error types
      if (apiError.error?.type === 'invalid_request_error') {
        throw new Error(`Invalid request: ${apiError.error.message}`);
      } else if (apiError.error?.type === 'rate_limit_error') {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error('Failed to generate script: ' + (apiError.error?.message || apiError.message));
      }
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
}); 