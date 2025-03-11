@echo off
echo Starting Reddit Clipper App with Cloudflare Tunnels...
echo.

:: Start the backend server
start cmd /k "echo Starting Backend Server... && cd backend && npm run dev"
echo Backend server starting...
echo.
timeout /t 5

:: Start the frontend server
start cmd /k "echo Starting Frontend Server... && npm run dev"
echo Frontend server starting...
echo.
timeout /t 5

:: Start Cloudflare tunnel for backend
start cmd /k "echo Creating Cloudflare Tunnel for Backend... && cloudflared tunnel --url http://localhost:3004"
echo Backend tunnel starting...
echo.
timeout /t 5

:: Start Cloudflare tunnel for frontend
start cmd /k "echo Creating Cloudflare Tunnel for Frontend... && cloudflared tunnel --url http://localhost:8080"
echo Frontend tunnel starting...
echo.

echo All services are starting!
echo You'll need to copy the Cloudflare Tunnel URLs from their respective windows.
echo Frontend URL is the one you should share with others.
echo.
pause 