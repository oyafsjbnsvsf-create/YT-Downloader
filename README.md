# Premium YouTube Downloader (Node + Express + yt-dlp)

This project is a **GitHub-ready** premium UI YouTube downloader.
Features:
- Thumbnail preview & video details (via yt-dlp)
- Format & quality selector
- Multiple output types: mp4, webm, mp3, wav
- Download size estimation (when available)
- Clipboard auto-detect YouTube link
- Mobile-responsive glass UI
- Dockerfile ready for Railway / Cloud Run / Docker

## Requirements
- Node.js 18+
- yt-dlp installed (or available in Docker image)
- ffmpeg installed (for audio/video recoding)

## Local run
1. Install dependencies:
   ```
   cd server
   npm ci
   ```
2. Ensure yt-dlp and ffmpeg are installed and in PATH.
3. Start server:
   ```
   npm start
   ```
4. Open `http://localhost:3000`

## Docker (Railway / Cloud Run)
Build image:
```
docker build -t ytdownloader:latest -f server/Dockerfile server
```
Run:
```
docker run -p 3000:3000 ytdownloader:latest
```

## Legal / Ethics
Respect YouTube's Terms of Service. Only download content you own or have permissions for.
