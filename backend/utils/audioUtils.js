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
 * Processes audio: removes silences and speeds up
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output audio file
 * @param {number} speedFactor - Speed factor (default: 1.3)
 * @param {boolean} pitchUp - Whether to pitch up the audio
 * @param {boolean} isHook - Whether the audio is a hook
 * @param {number|null} targetDuration - Target duration in seconds
 * @returns {Promise<void>}
 */
export async function processAudio(inputPath, outputPath, speedFactor = 1.3, pitchUp = false, isHook = true, targetDuration = null) {
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
          
          // PREMIERE PRO STYLE: Speed and pitch change together
          // In Premiere Pro, when you increase speed to 130%, the pitch also increases by 30%
          
          if (isHook) {
              // For hooks: fixed 1.3x speed and pitch increase
              speedFactor = 1.3;
              console.log(`Using true Premiere Pro style 1.3x speed+pitch increase for hook`);
              
              // Use asetrate to change both speed and pitch together, exactly like Premiere Pro
              // When asetrate increases the sample rate by 30%, both tempo and pitch increase by 30%
              const newSampleRate = Math.round(baseRate * 1.3);
              
              console.log(`Processing hook with TRUE Premiere Pro style 1.3x speed+pitch increase`);
              console.log(`Changing sample rate from ${baseRate} to ${newSampleRate} Hz to affect both speed and pitch`);
              
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
          } else if (targetDuration && targetDuration > 0) {
              // Calculate speed factor to reach target duration
              speedFactor = durationAfterSilence / targetDuration;
              
              // Limit speed factor to reasonable range for intelligibility
              speedFactor = Math.max(0.8, Math.min(2.0, speedFactor));
              
              console.log(`Using Premiere Pro style speed+pitch increase: ${speedFactor.toFixed(2)}x`);
          } else if (!isHook) {
              // For scripts without target duration, don't apply any speed/pitch change
              // This prevents double-processing when scripts are processed in two passes
              speedFactor = 1.0;
              console.log(`Using neutral 1.0x speed/pitch for script (no change)`);
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

/**
 * Transcribes audio and gets word-level timestamps
 * @param {string} audioPath - Path to the audio file
 * @param {string} elevenlabsApiKey - ElevenLabs API key
 * @param {string} openaiApiKey - OpenAI API key
 * @param {string} channelStyle - Channel style (default: 'grouped')
 * @param {string|null} openrouterApiKey - OpenRouter API key
 * @param {string|null} openrouterModel - OpenRouter model
 * @returns {Promise<Array>} - Array of processed words with timing
 */
export async function transcribeAudio(audioPath, elevenlabsApiKey, openaiApiKey, channelStyle = 'grouped', openrouterApiKey = null, openrouterModel = null) {
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
            11. Each word should be a separate entry in the array, even if part of a colored phrase
            
            You must follow the rules above, and return ONLY the JSON array. DO NOT write in markdown, just return the JSON array.`
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
      
      // Try to get color analysis with retries
      for (let colorAttempt = 1; colorAttempt <= MAX_RETRIES; colorAttempt++) {
        try {
          console.log(`Color analysis attempt ${colorAttempt}/${MAX_RETRIES}`);
          
          let importanceResponse;
          if (hasOpenAI) {
            importanceResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openrouterApiKey}`
              },
              body: JSON.stringify({
                model: 'anthropic/claude-3.7-sonnet',
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
                temperature: 0.7
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
            
            // Clean up the raw content before parsing
            let cleanedContent = rawContent.trim();
            
            // If content starts with a markdown code block, remove it
            if (cleanedContent.startsWith("```json")) {
              cleanedContent = cleanedContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
            } else if (cleanedContent.startsWith("```")) {
              cleanedContent = cleanedContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
            }
            
            try {
              // First try direct parsing
              colorAssignments = JSON.parse(cleanedContent);
            } catch (initialParseError) {
              console.warn(`Initial JSON parsing failed: ${initialParseError.message}`);
              console.warn("Attempting to fix malformed JSON...");
              
              // If direct parsing fails, try to fix common JSON issues
              // Replace any unescaped quotes inside strings
              cleanedContent = cleanedContent.replace(/([,{]\s*"[^"]+)\\*"/g, '$1\\"');
              
              // Fix missing commas between objects
              cleanedContent = cleanedContent.replace(/}\s*{/g, "},{");
              
              // Remove any trailing commas in arrays or objects
              cleanedContent = cleanedContent.replace(/,\s*}/g, "}").replace(/,\s*\]/g, "]");
              
              // Ensure the content is an array
              if (!cleanedContent.trim().startsWith("[")) {
                cleanedContent = "[" + cleanedContent;
              }
              if (!cleanedContent.trim().endsWith("]")) {
                cleanedContent = cleanedContent + "]";
              }
              
              try {
                colorAssignments = JSON.parse(cleanedContent);
              } catch (fallbackError) {
                console.error("Fallback JSON parsing also failed:", fallbackError.message);
                console.error("Falling back to manual extraction of word-color pairs");
                
                // Last resort: manually extract word-color pairs using regex
                colorAssignments = [];
                const wordColorRegex = /"word"\s*:\s*"([^"]*)"\s*,\s*"color"\s*:\s*"([^"]*)"/g;
                let match;
                
                while ((match = wordColorRegex.exec(cleanedContent)) !== null) {
                  colorAssignments.push({
                    word: match[1],
                    color: match[2]
                  });
                }
                
                if (colorAssignments.length === 0) {
                  // If all else fails, create default white assignments
                  const words = directData.text.split(' ');
                  colorAssignments = words.map(word => ({ word, color: 'white' }));
                  console.warn(`Created default white color assignments for ${words.length} words`);
                } else {
                  console.log(`Extracted ${colorAssignments.length} word-color pairs using regex`);
                }
              }
            }
            
            apiSuccess = true;
            console.log(`Color analysis completed successfully with ${colorAssignments.length} color assignments`);
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
            console.warn('All color analysis attempts failed, using default colors');
            // Create default color assignments (all white)
            const words = directData.text.split(' ');
            colorAssignments = words.map(word => ({ word, color: 'white' }));
            apiSuccess = true; // Mark as success with fallback colors
            console.log(`Created default color assignments for ${words.length} words`);
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
          fs.existsSync(path.join(path.dirname(audioPath), '..', 'transcriptions', 'script_text.txt')) ? 
            fs.readFileSync(path.join(path.dirname(audioPath), '..', 'transcriptions', 'script_text.txt'), 'utf8') : 
            'Script text not available' : 
          'Audio content';
        
        return await createFallbackWordTimings(audioPath, scriptText, channelStyle);
      }
    }
  }
} 