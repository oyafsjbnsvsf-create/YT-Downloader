/**
 * server.js
 * Express server for Premium YouTube downloader.
 * Requires: yt-dlp (in PATH), ffmpeg.
 */
import express from "express";
import { spawn } from "child_process";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import sanitize from "sanitize-filename";
import fs from "fs";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(process.cwd(), "../public");

app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60*1000,
  max: 12,
  message: { error: "Too many requests, slow down." }
});
app.use("/api/", limiter);

app.use(express.static(PUBLIC_DIR));

app.get("/health", (req,res)=>res.json({ok:true}));

// /api/info?url=...
// returns yt-dlp -j output (parsed) with a simplified formats list
app.get("/api/info", async (req,res)=>{
  const url = req.query.url;
  if(!url) return res.status(400).json({error:"Missing url"});
  try{
    const ytdlp = spawn("yt-dlp", ["-j", url]);
    let out = "";
    let err = "";
    ytdlp.stdout.on("data", d=> out += d.toString());
    ytdlp.stderr.on("data", d=> err += d.toString());
    ytdlp.on("close", code=>{
      if(code !== 0) return res.status(500).json({error:"yt-dlp failed", details: err});
      try{
        const info = JSON.parse(out);
        // Build simplified formats: select common containers and sizes
        const fmts = (info.formats||[]).map(f=>({
          format_id: f.format_id,
          ext: f.ext,
          format_note: f.format_note || "",
          filesize: f.filesize || f.filesize_approx || null,
          width: f.width || null,
          height: f.height || null,
          acodec: f.acodec || null,
          vcodec: f.vcodec || null,
          abr: f.abr || null,
          tbr: f.tbr || null
        }));
        const thumbnails = (info.thumbnails||[]).map(t=>t.url).reverse();
        res.json({
          id: info.id,
          title: info.title,
          uploader: info.uploader,
          duration: info.duration,
          description: info.description,
          thumbnails,
          formats: fmts,
          webpage_url: info.webpage_url,
          extractor: info.extractor,
        });
      }catch(e){
        return res.status(500).json({error:"Failed to parse yt-dlp output", details:e.toString()});
      }
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error:"Server error"});
  }
});

// Download endpoint
// /api/download?url=...&format=mp4|mp3|webm|wav&format_id=...&filename=...
app.get("/api/download", async (req,res)=>{
  const url = req.query.url;
  const format = (req.query.format || "mp4").toLowerCase();
  const format_id = req.query.format_id;
  const rawName = req.query.filename || "youtube";
  const safeName = sanitize(rawName).slice(0,120) || "youtube";

  if(!url) return res.status(400).json({error:"Missing url"});

  try{
    let args = [];
    if(format === "mp3" || format === "wav"){
      // extract audio
      args = ["-f","bestaudio", "--extract-audio", "--audio-format", format, "--audio-quality","0", "-o","-"];
      res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg":"audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.${format}"`);
      if(format_id) args = ["-f", format_id, "--extract-audio","--audio-format", format, "-o","-"];
    } else {
      // video formats: try to use selected format_id or choose best for container
      if(format_id){
        args = ["-f", format_id, "-o", "-"];
      } else {
        // choose bestvideo+bestaudio remux into requested container if possible
        const prefer = format === "mp4" ? "mp4" : format === "webm" ? "webm" : "mp4";
        args = ["-f", `bestvideo[ext=${prefer}]+bestaudio/best`, "--recode-video", prefer, "-o", "-"];
      }
      const ctype = format === "mp4" ? "video/mp4" : format === "webm" ? "video/webm" : "application/octet-stream";
      res.setHeader("Content-Type", ctype);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.${format}"`);
    }

    // spawn yt-dlp and stream stdout to response
    const ytdlp = spawn("yt-dlp", args, { stdio: ["ignore","pipe","pipe"] });

    ytdlp.stdout.on("data", chunk=>{
      try{ res.write(chunk); }catch(e){}
    });
    let stderr = "";
    ytdlp.stderr.on("data", d=> stderr += d.toString());
    ytdlp.on("close", code=>{
      if(code === 0){
        try{ res.end(); }catch(e){}
      } else {
        console.error("yt-dlp failed:", code, stderr);
        if(!res.headersSent) return res.status(500).json({error:"yt-dlp failed", details: stderr});
        try{ res.end(); }catch(e){}
      }
    });

    req.on("close", ()=>{ if(!ytdlp.killed) ytdlp.kill("SIGKILL"); });

  }catch(err){
    console.error(err);
    if(!res.headersSent) res.status(500).json({error:"Server error"});
    else res.end();
  }
});

app.listen(PORT, ()=>console.log(`Server listening on ${PORT}`));
