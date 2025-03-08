# Reddit Clipper Backend

This is the backend server for the Reddit Clipper application. It handles audio generation using the ElevenLabs API and processes the audio files to remove silences and speed up the audio.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Run the server:
   ```
   npm run start
   ```

3. For development with auto-restart:
   ```
   npm run dev
   ```

## API Endpoints

- `POST /api/save-user-settings` - Save user settings
- `GET /api/user-settings/:userId` - Get user settings
- `POST /api/generate-video` - Generate audio for a Reddit post
- `POST /api/login` - Login and save user settings

## Environment Variables

- `PORT` - Port to run the server on (default: 3003)

## Running with Frontend

From the root directory, you can run both the frontend and backend together:

```
npm run dev:all
```

This will start both the Vite development server for the frontend and the backend server with auto-restart enabled. 