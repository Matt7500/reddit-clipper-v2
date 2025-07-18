import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from "elevenlabs";

const execAsync = promisify(exec);

/**
 * Generates audio using ElevenLabs API
 * @param {string} text - The text to convert to speech
 * @param {string} apiKey - ElevenLabs API key
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {string} modelId - ElevenLabs model ID
 * @returns {Promise<ArrayBuffer>} - ArrayBuffer containing the audio data
 */
export async function generateAudio(text, apiKey, voiceId, modelId) {
  try {
    console.log(`Generating audio for text: "${text.substring(0, 30)}..." with voice ID: ${voiceId}`);
    console.log(`Model ID: ${modelId}`);
    
    const client = new ElevenLabsClient({ apiKey });
    
    const audioStream = await client.textToSpeech.convert(voiceId, {
      output_format: "mp3_44100_192",
      text: text,
      model_id: modelId,
      voice_settings: {
        stability: 0.9,
        similarity_boost: 0.75
      }
    });

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    
    const audioBuffer = Buffer.concat(chunks);
    console.log('Audio generated successfully');
    return audioBuffer;
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

/**
 * Gets audio duration using ffmpeg
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<string>} - Duration in HH:MM:SS.MMM format
 */
export async function getAudioDuration(filePath) {
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

/**
 * Gets audio sample rate using ffmpeg
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<number>} - Sample rate in Hz
 */
export async function getAudioSampleRate(filePath) {
    const { stdout } = await execAsync(`ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    return parseInt(stdout.trim());
}

/**
 * Cleans up files
 * @param {string[]} files - Array of file paths to clean up
 * @returns {Promise<void>}
 */
export async function cleanupFiles(files) {
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

/**
 * Removes silence from the entire audio file using FFmpeg's silenceremove filter.
 * @param {string} inputFile - Path to input audio file
 * @param {string} outputFile - Path to output audio file
 * @param {number} silenceThresholdDb - Silence threshold in dB (default: -30.0)
 * @param {Object} options - Additional options for silence removal
 * @returns {Promise<boolean>} - Returns true if successful, false otherwise
 */
export async function removeSilence(inputFile, outputFile, silenceThresholdDb = -35.0, options = {}) {
  try {
    // Default options
    const {
      startThreshold = silenceThresholdDb,
      stopThreshold = silenceThresholdDb,
      startDuration = 0.05,  // 50ms minimum duration for silence at the start
      stopDuration = 0.05,   // 50ms minimum duration for silence in the middle/end
      detectionMethod = 'rms', // 'rms' is more aggressive than 'peak'
      startPeriods = 1,       // Number of silence periods to remove from start
      stopPeriods = -1        // -1 means all silence periods
    } = options;
    
    console.log(`Removing silence with thresholds: start=${startThreshold}dB, stop=${stopThreshold}dB`);
    console.log(`Silence durations: start=${startDuration}s, stop=${stopDuration}s, method=${detectionMethod}`);
    
    // Build ffmpeg command for silence removal
    // More aggressive parameters based on real-world testing
    const silenceFilter = (
      `silenceremove=start_periods=${startPeriods}:start_duration=${startDuration}:` +
      `start_threshold=${startThreshold}dB:detection=${detectionMethod},` +
      `silenceremove=stop_periods=${stopPeriods}:stop_duration=${stopDuration}:` +
      `stop_threshold=${stopThreshold}dB:detection=${detectionMethod}`
    );
    
    const command = `ffmpeg -i "${inputFile}" -af "${silenceFilter}" -y "${outputFile}"`;
    console.log(`Executing command: ${command}`);
    
    // Execute ffmpeg command
    const { stdout, stderr } = await execAsync(command);
    
    // FFmpeg outputs to stderr even on success, so we need to check for specific error indicators
    if (stderr) {
      console.log(`FFmpeg output: ${stderr}`);
      if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('invalid')) {
        console.error(`FFmpeg silence removal error detected`);
        return false;
      }
    }
    
    // Verify file exists and has content
    const fileExists = fs.existsSync(outputFile);
    if (fileExists) {
      try {
        const stats = fs.statSync(outputFile);
        console.log(`Output file size: ${stats.size} bytes`);
        
        // Get and log the duration difference to verify silence was removed
        const { stdout: originalDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFile}"`);
        const { stdout: newDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputFile}"`);
        
        const originalDuration = parseFloat(originalDurationStdout);
        const newDuration = parseFloat(newDurationStdout);
        const reductionPercent = ((originalDuration - newDuration) / originalDuration) * 100;
        
        console.log(`Silence removal stats: Original=${originalDuration.toFixed(2)}s, New=${newDuration.toFixed(2)}s, Reduction=${reductionPercent.toFixed(1)}%`);
        
        if (stats.size < 1000) {
          console.warn('Output file is suspiciously small, might be corrupted');
        }
      } catch (err) {
        console.error(`Error checking output file: ${err.message}`);
      }
    } else {
      console.error('Output file was not created');
    }
    
    return fileExists;
  } catch (error) {
    console.error(`Error in silence removal: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

/**
 * Processes audio: removes silences and speeds up
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output audio file
 * @param {number} speedFactor - Speed factor (default: 1.3)
 * @param {boolean} pitchUp - Whether to pitch up the audio
 * @param {boolean} isHook - Whether the audio is a hook
 * @param {number|null} audioSpeed - Audio speed factor (1.0 to 2.0)
 * @returns {Promise<void>}
 */
export async function processAudio(inputPath, outputPath, speedFactor = 1.3, pitchUp = false, isHook = true, audioSpeed = null) {
  console.log('Processing audio with parameters:', {
      inputPath,
      outputPath,
      speedFactor,
      pitchUp,
      isHook,
      audioSpeed
  });

  // Get the base sample rate and duration of the input audio directly
  try {
      const baseRate = await getAudioSampleRate(inputPath);
      const { stdout: durationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`);
      const currentDuration = parseFloat(durationStdout);
      
      console.log(`Original audio stats:`, {
          sampleRate: baseRate,
          duration: currentDuration,
          audioSpeed: audioSpeed
      });

      // Use the new improved silence removal method
      const silenceRemovedTemp = outputPath + '.silence-removed.wav';
      
      // Adjust threshold parameters based on whether this is a hook or script
      const silenceThresholdDb = isHook ? -35.0 : -37.0; // More aggressive for scripts
      
      // Use different settings for hooks vs. scripts
      const silenceOptions = {
        startThreshold: silenceThresholdDb,
        stopThreshold: silenceThresholdDb,
        startDuration: isHook ? 0.05 : 0.08,   // Longer minimum for scripts
        stopDuration: isHook ? 0.05 : 0.08,
        detectionMethod: 'rms',   // More aggressive than peak
      };
      
      // Call the new removeSilence function
      const silenceRemoved = await removeSilence(inputPath, silenceRemovedTemp, silenceThresholdDb, silenceOptions);
      
      if (!silenceRemoved) {
          console.error('Silence removal failed, using original audio');
          await fs.promises.copyFile(inputPath, silenceRemovedTemp);
      }
      
      if (pitchUp) {
          // Get duration after silence removal
          const { stdout: silenceDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${silenceRemovedTemp}"`);
          const durationAfterSilence = parseFloat(silenceDurationStdout);
          
          // PREMIERE PRO STYLE: Speed and pitch change together
          // In Premiere Pro, when you increase speed to 130%, the pitch also increases by 30%
          
          // Use audioSpeed if provided, otherwise use default behavior
          if (audioSpeed && audioSpeed > 0) {
              speedFactor = audioSpeed;
              console.log(`Using user-defined audio speed: ${speedFactor}x`);
          } else if (isHook) {
              // For hooks: fixed 1.3x speed and pitch increase
              // Need to compensate for the slight deviation in speed ratio to achieve exactly 1.3x
              const targetSpeedRatio = 1.3;
              const compensationFactor = 1.33; // Slightly higher to compensate for processing artifacts
              console.log(`Using true Premiere Pro style with compensated factor ${compensationFactor.toFixed(2)} to achieve ${targetSpeedRatio}x speed+pitch increase for hook`);
              
              // Use SAME implementation for hooks as scripts - asetrate for reliable pitch+speed change
              // Use asetrate to change both speed and pitch together, exactly like Premiere Pro
              const newSampleRate = Math.ceil(baseRate * compensationFactor);
              
              console.log(`Processing hook with asetrate: targeting ${targetSpeedRatio}x speed+pitch increase`);
              console.log(`Changing sample rate from ${baseRate} to ${newSampleRate} Hz for hook (compensation factor applied)`);
              
              // Apply the sample rate change first (affects both pitch and tempo)
              const sampleRateChangedTemp = outputPath + '.rate-changed.wav';
              await execAsync(`ffmpeg -i "${silenceRemovedTemp}" -af "asetrate=${newSampleRate}" -y "${sampleRateChangedTemp}"`);
              
              // Convert back to original sample rate without affecting the pitch/speed change
              await execAsync(`ffmpeg -i "${sampleRateChangedTemp}" -ar ${baseRate} -y "${outputPath}"`);
              
              // Clean up temporary files
              await cleanupFiles([silenceRemovedTemp, sampleRateChangedTemp]);
              
              // Verify final duration for hook
              const { stdout: finalDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);
              const finalDuration = parseFloat(finalDurationStdout);
              console.log('Final hook audio duration:', {
                  originalDuration: durationAfterSilence,
                  actualDuration: finalDuration,
                  speedRatio: durationAfterSilence / finalDuration
              });
              
              return;
          } else {
              // Default for other cases
              speedFactor = 1.3;
              console.log(`Using default 1.3x speed+pitch increase`);
          }
          
          // Use asetrate to change both speed and pitch together, exactly like Premiere Pro
          // When asetrate increases the sample rate by 30%, both tempo and pitch increase by 30%
          const newSampleRate = Math.round(baseRate * speedFactor);
          
          console.log(`Processing audio with TRUE Premiere Pro style ${speedFactor.toFixed(2)}x speed+pitch increase`);
          console.log(`Changing sample rate from ${baseRate} to ${newSampleRate} Hz`);
          
          // Apply the sample rate change first (affects both pitch and tempo)
          const sampleRateChangedTemp = outputPath + '.rate-changed.wav';
          await execAsync(`ffmpeg -i "${silenceRemovedTemp}" -af "asetrate=${newSampleRate}" -y "${sampleRateChangedTemp}"`);
          
          // Convert back to original sample rate without affecting the pitch/speed change
          await execAsync(`ffmpeg -i "${sampleRateChangedTemp}" -ar ${baseRate} -y "${outputPath}"`);
          
          // Clean up temporary files
          await cleanupFiles([silenceRemovedTemp, sampleRateChangedTemp]);
          
          // Verify final duration
          const { stdout: finalDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);
          const finalDuration = parseFloat(finalDurationStdout);
          
          console.log('Final audio duration:', {
              originalDuration: durationAfterSilence,
              actualDuration: finalDuration,
              speedRatio: durationAfterSilence / finalDuration
          });
      } else {
          // When pitch up is false, use atempo for speed change only
          let effectiveSpeedFactor = speedFactor;
          
          // Get duration after silence removal
          const { stdout: silenceDurationStdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${silenceRemovedTemp}"`);
          const durationAfterSilence = parseFloat(silenceDurationStdout);
          
          // Use audioSpeed if provided
          if (audioSpeed && audioSpeed > 0) {
              effectiveSpeedFactor = audioSpeed;
              console.log(`Using user-defined audio speed: ${effectiveSpeedFactor}x`);
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
              originalDuration: durationAfterSilence,
              actualDuration: finalDuration,
              speedRatio: durationAfterSilence / finalDuration
          });
      }
  } catch (error) {
      console.error('Error processing audio:', error);
      throw error;
  }
}

/**
 * Transcribes audio and gets word-level timestamps
 * @param {string} audioPath - Path to the audio file
 * @param {string} elevenlabsApiKey - ElevenLabs API key
 * @param {string} openaiApiKey - OpenAI API key
 * @param {string} channelStyle - Channel style (default: 'grouped')
 * @param {string|null} openrouterApiKey - OpenRouter API key
 * @returns {Promise<Array>} - Array of processed words with timing
 */
export async function transcribeAudio(audioPath, elevenlabsApiKey, openaiApiKey, channelStyle = 'grouped', openrouterApiKey = null) {
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
  
  // Try to get transcription with retries using ElevenLabsClient
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Transcription attempt ${attempt}/${MAX_RETRIES} using ElevenLabsClient...`);
      
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
      
      // Use ElevenLabsClient to perform the transcription
      console.log('Using ElevenLabsClient to transcribe audio...');
      const client = new ElevenLabsClient({ apiKey: elevenlabsApiKey });
      
      // Create a read stream for the audio file
      const fileStream = fs.createReadStream(audioPath);
      
      // Call the speechToText.convert method
      const directData = await client.speechToText.convert({
        file: fileStream,
        model_id: 'scribe_v1'
      });
      
      console.log("ElevenLabsClient transcription succeeded!");
      
      // Process the response
      if (!directData || !directData.text || !directData.words || directData.words.length === 0) {
        throw new Error('Invalid response from ElevenLabs API call');
      }
      
      // Process the transcription response
      const processedWords = processTranscriptionResponse(directData);
      
      // Skip color analysis if OpenAI API key is missing
      if (!openaiApiKey && !openrouterApiKey) {
        console.warn('Skipping color analysis due to missing API keys');
        
        console.log(`Transcribed into ${processedWords.length} words (all white due to missing API keys)`);
        return processedWords;
      }
      
      // Analyze text for important words using OpenRouter API (using OpenAI SDK format)
      console.log('Analyzing text for word importance...');
      const systemPrompt = channelStyle === 'single' 
        ? `You are a text analyzer that identifies important words and phrases in text and assigns them colors. You must put a focus on coloring phrases rather than single words.
            Rules:
            1. The majority of words should remain white (default)
            2. Key phrases or words crucial to the meaning should be yellow (can be multiple consecutive words)
            3. Action phrases or dramatic emphasis should be red (can be multiple consecutive words)
            4. Positive/successful phrases should be green (can be multiple consecutive words)
            5. Special/unique/rare phrases should be purple (can be multiple consecutive words)
            6. Only color truly important words/phrases - most should stay white
            7. When coloring multiple consecutive words as a phrase, each word in the phrase should get the same color
            8. Return ONLY a JSON array with each word and its color, DO NOT RETURN ANYTHING ELSE
            9. DO NOT write your response in markdown, just return the JSON array.
            10. The JSON array MUST be in the format: [{"word": "word", "color": "color"}, {"word": "word", "color": "color"}]
            11. Each word should be a separate entry in the array, even if part of a colored phrase
            
            You must follow the rules above, and return ONLY the JSON array. DO NOT write in markdown, just return the JSON array in EXACTLY the format specified above.`
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
            9. The JSON array MUST be in the format: [{"word": "word", "color": "color"}, {"word": "word", "color": "color"}]`;

      let colorAssignments = [];
      let apiSuccess = false;
      
      // Try to get color analysis with retries
      for (let colorAttempt = 1; colorAttempt <= MAX_RETRIES; colorAttempt++) {
        try {
          console.log(`Color analysis attempt ${colorAttempt}/${MAX_RETRIES}`);
          
          // Use OpenRouter with OpenAI SDK format - single implementation for both paths
          const apiKey = openrouterApiKey; // Use whichever key is available
          const modelToUse = 'anthropic/claude-3.7-sonnet';
          
          const importanceResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'X-Title': 'Reddit Clipper' // Optional app name for OpenRouter stats
            },
            body: JSON.stringify({
              model: modelToUse,
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
              temperature: 1, // Keep temperature for some variability
              max_tokens: 8000, // Further increased token limit
              response_format: { type: "json_object" } // Request JSON format specifically
            })
          });

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
            
            // NEW APPROACH: Parse JSON more robustly with targeted validation
            // Instead of trying to parse the entire JSON at once, we'll validate and fix item by item
            
            let cleanedContent = rawContent.trim();
            let finalColorAssignments = [];
            
            // Remove JSON code blocks and any extra text before/after the array
            if (cleanedContent.includes('[') && cleanedContent.includes(']')) {
              cleanedContent = cleanedContent.substring(
                cleanedContent.indexOf('['),
                cleanedContent.lastIndexOf(']') + 1
              );
            }
            
            // Remove markdown code blocks if present
            if (cleanedContent.startsWith("```json")) {
              cleanedContent = cleanedContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
            } else if (cleanedContent.startsWith("```")) {
              cleanedContent = cleanedContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }
            
            // Try parsing entire JSON first as a quick approach
            try {
              finalColorAssignments = JSON.parse(cleanedContent);
              console.log("Successfully parsed full JSON directly");

              // Check if the parsed result is a single object and wrap it in an array
              if (finalColorAssignments && typeof finalColorAssignments === 'object' && !Array.isArray(finalColorAssignments)) {
                console.warn("Parsed JSON was a single object, wrapping in an array.");
                finalColorAssignments = [finalColorAssignments];
              } else if (!Array.isArray(finalColorAssignments)) {
                // If it's not an array and not an object we can wrap, treat as parse failure
                console.warn("Parsed JSON was not an array or a single object.");
                throw new Error("Parsed JSON is not an array"); // Trigger the catch block for fallback parsing
              }

            } catch (fullParseError) {
              console.warn(`Initial full JSON parsing failed: ${fullParseError.message}`);
              
              // If that fails, extract and validate each item individually
              console.log("Extracting and validating items individually...");
              
              // Extract each object separately using regex
              const itemRegex = /\{\s*(?:"word"|word)\s*:\s*(?:"([^"]*)"|'([^']*)')\s*,\s*(?:"color"|color)\s*:\s*(?:"([^"]*)"|'([^']*)')\s*\}/g;
              let match;
              let validItems = [];
              
              while ((match = itemRegex.exec(cleanedContent)) !== null) {
                // Extract the word and color from all possible capture groups
                const word = match[1] || match[2] || "";
                const color = match[3] || match[4] || "white";
                
                // Only add valid items
                if (word) {
                  validItems.push({ word, color });
                }
              }
              
              if (validItems.length > 0) {
                finalColorAssignments = validItems;
                console.log(`Successfully extracted ${validItems.length} valid word-color pairs`);
              } else {
                // Last resort: Try to fix each line and then parse
                console.log("Attempting line-by-line parsing and fixing...");
                
                const lines = cleanedContent.split("\n");
                const itemPattern = /\s*\{\s*(?:"word"|word)\s*:\s*(?:"([^"]*)"|'([^']*)')\s*,\s*(?:"color"|color)\s*:\s*(?:"([^"]*)"|'([^']*)')\s*\}\s*/;
                
                for (const line of lines) {
                  // Skip empty lines or lines that are clearly not JSON objects
                  if (!line.trim() || (!line.includes("{") && !line.includes("}"))) {
                    continue;
                  }
                  
                  const itemMatch = line.match(itemPattern);
                  if (itemMatch) {
                    const word = itemMatch[1] || itemMatch[2] || "";
                    const color = itemMatch[3] || itemMatch[4] || "white";
                    
                    if (word) {
                      validItems.push({ word, color });
                    }
                  }
                }
                
                if (validItems.length > 0) {
                  finalColorAssignments = validItems;
                  console.log(`Extracted ${validItems.length} items through line-by-line parsing`);
                }
              }
              
              // If we still have no valid items, fallback to splitting the text directly
              if (finalColorAssignments.length === 0) {
                console.warn('Falling back to direct text splitting');
                const words = directData.text.split(' ')
                                            .filter(w => w.trim() !== '')
                                            .map(w => w.replace(/[^a-zA-Z0-9']/g, ''));
                finalColorAssignments = words.map(word => ({ word, color: 'white' }));
              }
            }
            
            // Validate and clean the final assignments
            const validColors = ['white', 'yellow', 'red', 'green', 'purple'];
            colorAssignments = finalColorAssignments.filter(item => !!item && !!item.word).map(item => ({
              word: (item.word || "").toString().trim(),
              color: validColors.includes((item.color || "").toLowerCase()) 
                ? (item.color || "").toLowerCase() 
                : 'white'
            }));
            
            console.log(`Final validated color assignments: ${colorAssignments.length} items`);
            apiSuccess = true;
            break;
          } catch (parseError) {
            console.error('Failed to parse API response content:', importanceData.choices[0].message.content);
            // Don't throw here, just log the error and let the retry mechanism handle it
            console.error(`Parse error: ${parseError.message}`);
          }
        } catch (colorError) {
          console.error(`Color analysis attempt ${colorAttempt} failed: ${colorError.message}`);
          console.error(colorError.stack);
          
          if (colorAttempt < MAX_RETRIES) {
            // Try the next model in the list
            console.log(`Switching to next model for retry...`);
            
            console.log(`Waiting ${RETRY_DELAY/1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          } else {
            console.warn('All color analysis attempts failed. Keeping original timings and setting all words to white.');
            // Use the already processed words with original timings
            // Set all colors to white as a fallback
            processedWords.forEach(word => { word.color = 'white'; });
            apiSuccess = true; // Mark as success since we have timings
            // No need to set colorAssignments, we directly modify processedWords
          }
        }
      }

      // If color analysis succeeded (or fell back to white), apply colors
      // This part is only needed if color analysis was successful and didn't use the fallback
      if (colorAssignments && colorAssignments.length > 0) {
        // Create a map of words to their colors for easy lookup
        const wordColorMap = new Map();
        colorAssignments.forEach(item => {
          wordColorMap.set(item.word.toLowerCase(), item.color);
        });
        
        // Apply colors to the processed words
        for (const word of processedWords) {
          word.color = wordColorMap.get(word.text.toLowerCase()) || 'white';
        }
      }

      // Log the final result
      console.log(`Transcribed into ${processedWords.length} words with colors (fallback may apply)`);

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
          fs.existsSync(path.join(path.dirname(audioPath), '..', 'transcriptions', 'script_text.txt')) ? 
            fs.readFileSync(path.join(path.dirname(audioPath), '..', 'transcriptions', 'script_text.txt'), 'utf8') : 
            'Script text not available' : 
          'Audio content';
        
        return await createFallbackWordTimings(audioPath, scriptText, channelStyle);
      }
    }
  }
} 