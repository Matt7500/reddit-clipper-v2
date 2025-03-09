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

// Reset OpenAI client when API key changes
const resetOpenAIClient = () => {
  openaiClient = null;
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

        if (pitchUp) {
            // First remove silences regardless of hook or script
            const silenceRemovedTemp = outputPath + '.silence-removed.wav';
            const silenceFilter = 'silenceremove=stop_periods=-1:stop_duration=0.05:stop_threshold=-35dB:detection=peak';
            await execAsync(`ffmpeg -i "${normalizedAudio}" -af "${silenceFilter}" "${silenceRemovedTemp}"`);
            
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

            // Calculate the exact sample rate needed for pitch adjustment
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
            
            // Prepare the filter chain
            let filterChain;
            
            if (tempoFactor === 1.0) {
                // Just apply pitch change if no additional tempo adjustment needed
                filterChain = [
                    `asetrate=${newRate}`,  // Adjust sample rate for pitch
                    `aresample=${baseRate}` // Resample to original rate
                ].join(',');
            } else {
                // Apply both pitch change and additional tempo adjustment
                filterChain = [
                    `asetrate=${newRate}`,         // Adjust sample rate for pitch
                    `aresample=${baseRate}`,       // Resample to original rate
                    `atempo=${tempoFactor.toFixed(4)}`  // Additional tempo adjustment
                ].join(',');
            }

            await execAsync(`ffmpeg -i "${silenceRemovedTemp}" -af "${filterChain}" -ar ${baseRate} "${outputPath}"`);
            
            // Clean up temporary file
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
            const silenceFilter = 'silenceremove=stop_periods=-1:stop_duration=0.05:stop_threshold=-35dB:detection=peak';
            await execAsync(`ffmpeg -i "${normalizedAudio}" -af "${silenceFilter}" "${silenceRemovedTemp}"`);
            
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
            
            const filterChain = `atempo=${effectiveSpeedFactor.toFixed(4)}`;
            
            // Apply speed adjustment to the silence-removed audio
            await execAsync(`ffmpeg -i "${silenceRemovedTemp}" -af "${filterChain}" "${outputPath}"`);
            
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
        // Clean up temporary files
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
async function transcribeAudio(audioPath, elevenlabsApiKey, openaiApiKey, channelStyle = 'grouped') {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  
  // Validate API keys at the beginning
  if (!elevenlabsApiKey || elevenlabsApiKey.trim() === '') {
    console.error('ElevenLabs API key is missing or empty');
    throw new Error('ElevenLabs API key is required for transcription');
  }
  
  if (!openaiApiKey || openaiApiKey.trim() === '') {
    console.warn('OpenAI API key is missing or empty - color analysis will be skipped');
    // We'll continue without OpenAI API key, but color analysis will be skipped
  } else {
    console.log('OpenAI API key is present for color analysis');
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
      if (!openaiApiKey || openaiApiKey.trim() === '') {
        console.warn('Skipping color analysis due to missing OpenAI API key');
        
        // Write processed transcription to file with default colors (all white)
        // const timestamp = Date.now();
        // const processedTranscriptionPath = path.join(transcriptionsDir, `processed_transcription_${timestamp}.json`);
        // fs.writeFileSync(processedTranscriptionPath, JSON.stringify({
        //   words: processedWords,
        //   colorAssignments: processedWords.map(word => ({ word: word.text, color: 'white' })),
        //   channelStyle
        // }, null, 2));
        
        
        console.log(`Transcribed into ${processedWords.length} words (all white due to missing OpenAI API key)`);
        return processedWords;
      }
      
      // Analyze text for important words using fetch to OpenAI API directly
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
      let openaiSuccess = false;
      
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
          
          const importanceResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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

          // Log the response status
          console.log(`OpenAI API response status: ${importanceResponse.status}`);
          
          if (!importanceResponse.ok) {
            const errorText = await importanceResponse.text();
            throw new Error(`OpenAI API returned status ${importanceResponse.status}: ${errorText}`);
          }

          const importanceData = await importanceResponse.json();
          
          // Log the response structure
          console.log(`OpenAI response received with ${importanceData.choices ? importanceData.choices.length : 0} choices`);
          
          if (!importanceData || !importanceData.choices || !importanceData.choices[0] || !importanceData.choices[0].message || !importanceData.choices[0].message.content) {
            console.error('Invalid OpenAI response structure:', JSON.stringify(importanceData));
            throw new Error('Invalid response from OpenAI API');
          }
          
          try {
            // Log the raw content before parsing
            const rawContent = importanceData.choices[0].message.content;
            console.log(`OpenAI raw response content (first 100 chars): ${rawContent.substring(0, 100)}...`);
            
            colorAssignments = JSON.parse(rawContent);
            openaiSuccess = true;
            console.log(`Color analysis completed successfully with ${colorAssignments.length} color assignments`);
            break;
          } catch (parseError) {
            console.error('Failed to parse OpenAI response content:', importanceData.choices[0].message.content);
            throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
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

async function createBackgroundVideo(seed, requiredDurationSeconds, background_video_type) {
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
    
    // Randomly shuffle all videos
    const shuffledFiles = [...mp4Files].sort(() => Math.random() - 0.5);
    let selectedVideos = [];
    let totalDuration = 0;
    let totalFrames = 0;
    
    // Temporary directory to download videos for duration checking
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Select videos until we have enough duration
    for (const file of shuffledFiles) {
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

    // If we don't have enough duration, repeat the process with the videos we have
    while (totalDuration < requiredDurationSeconds) {
      const additionalVideos = [...selectedVideos].sort(() => Math.random() - 0.5);
      for (const videoInfo of additionalVideos) {
        totalDuration += videoInfo.durationInSeconds;
        totalFrames += videoInfo.durationInFrames;
        
        // Add the video again to the sequence
        selectedVideos.push({...videoInfo});

        if (totalDuration >= requiredDurationSeconds) {
          break;
        }
      }
    }

    return { 
      videos: selectedVideos, 
      totalDurationInFrames: Math.round(totalFrames),
      totalDuration: totalDuration
    };
  } catch (error) {
    console.error('Error creating background video sequence:', error);
    throw error;
  }
}

// Function to render hook video using Remotion
async function renderHookVideo(hookAudioPath, scriptAudioPath, channelName, channelImageUrl, hookText, scriptText, outputPath, openaiApiKey, elevenlabsApiKey, channelStyle = 'grouped', font = 'Jellee', fontUrl = null, has_background_music = false, subtitle_size = 64, stroke_size = 8, res, filesToCleanup, background_video_type = 'gameplay', userId, timestamp) {
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
      wordTimings = await transcribeAudio(scriptAudioPath, elevenlabsApiKey, openaiApiKey, channelStyle);
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
    const seed = Date.now();
    const { videos, totalDurationInFrames } = await createBackgroundVideo(seed, totalDurationInSeconds, background_video_type);
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
    const serverAddress = '192.168.4.37:3003'; // Your machine's IP and port
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
    const { userId, elevenlabsApiKey, elevenlabsVoiceModel, openaiApiKey, otherSettings } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId. Please provide a valid user ID.' 
      });
    }
    
    console.log(`Saving settings for user: ${userId}`);
    
    // Save to in-memory cache
    userSettingsCache.set(userId, {
      elevenlabsApiKey,
      elevenlabsVoiceModel,
      openaiApiKey,
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
  // Set headers for streaming response
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

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
        error: 'ElevenLabs API key is required. Please add it to your settings.'
      });
    }

    if (!openaiApiKey) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key is required for subtitle generation. Please add it to your settings.'
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

    // Process hook audio with fixed speed (1.3x) and remove silences
    console.log('Processing hook audio...');
    await processAudio(hookAudioRawPath, hookAudioProcessedPath, 1.3, pitch_up, true);
    
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
    let scriptSpeedFactor = 1.2; // Default speed factor
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
        timestamp
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
    const { userId, elevenlabsApiKey, elevenlabsVoiceModel, openaiApiKey, otherSettings } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId. Please provide a valid user ID.' 
      });
    }
    
    console.log(`User login: ${userId}`);
    
    // Save settings to cache on login if provided
    if (elevenlabsApiKey || elevenlabsVoiceModel || openaiApiKey || otherSettings) {
      const existingSettings = userSettingsCache.get(userId) || {};
      
      userSettingsCache.set(userId, {
        ...existingSettings,
        ...(elevenlabsApiKey && { elevenlabsApiKey }),
        ...(elevenlabsVoiceModel && { elevenlabsVoiceModel }),
        ...(openaiApiKey && { openaiApiKey }),
        ...(otherSettings && { ...otherSettings }),
        lastUpdated: new Date().toISOString()
      });
      
      console.log(`Settings saved on login for user: ${userId}`);
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
    const { openaiApiKey } = req.body;

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
      const script = cleanText(scriptMatch[1]);

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

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://0.0.0.0:${PORT}`);
  console.log(`Audio files will be available at: http://0.0.0.0:${PORT}/audio/`);
  console.log(`Images will be available at: http://0.0.0.0:${PORT}/images/`);
}); 