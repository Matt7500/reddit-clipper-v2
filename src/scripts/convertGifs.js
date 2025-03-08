import ffmpeg from 'fluent-ffmpeg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Source directory:', sourceDir);
console.log('Output directory:', outputDir);

// Create output directory and any necessary parent directories
try {
  mkdirSync(outputDir, { recursive: true });
  console.log('Created output directory:', outputDir);
} catch (err) {
  console.error('Error creating output directory:', err);
  process.exit(1);
}

// Get all gif files
const gifFiles = readdirSync(sourceDir).filter(file => file.endsWith('.gif'));
console.log('Found GIF files:', gifFiles);

gifFiles.forEach(file => {
  const inputPath = join(sourceDir, file);
  const outputPath = join(outputDir, file.replace('.gif', '.mp4'));

  console.log(`Converting ${inputPath} to ${outputPath}`);

  ffmpeg(inputPath)
    .outputOptions([
      '-vf', 'format=yuv420p,scale=-2:40:flags=lanczos,pad=max(iw\\,ih):max(iw\\,ih):x=(max(iw\\,ih)-iw)/2:y=(max(iw\\,ih)-ih)/2:color=white',
      '-r', '30',
      '-pix_fmt', 'yuv420p'
    ])
    .output(outputPath)
    .on('start', (commandLine) => {
      console.log('Spawned FFmpeg with command:', commandLine);
    })
    .on('end', () => {
      console.log(`Successfully converted ${file}`);
    })
    .on('error', (err) => {
      console.error(`Error converting ${file}:`, err);
    })
    .run();
}); 