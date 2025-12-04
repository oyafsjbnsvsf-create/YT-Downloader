// Frontend logic for Premium UI
const urlInput = document.getElementById('url');
const pasteBtn = document.getElementById('pasteBtn');
const infoBtn = document.getElementById('infoBtn');
const preview = document.getElementById('preview');
const thumb = document.getElementById('thumb');
const titleEl = document.getElementById('title');
const uploaderEl = document.getElementById('uploader');
const durationEl = document.getElementById('duration');
const descriptionEl = document.getElementById('description');
const controls = document.getElementById('controls');
const formatSelect = document.getElementById('formatSelect');
const qualitySelect = document.getElementById('qualitySelect');
const estimateEl = document.getElementById('estSize');
const filenameInput = document.getElementById('filename');
const downloadBtn = document.getElementById('downloadBtn');
const progressEl = document.getElementById('progress');

// helper
const fmtBytes = n=> n==null? '—' : (n<1024? n+' B' : n<1048576? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(2)+' MB');

async function readFromClipboard(){
  if(navigator.clipboard && navigator.clipboard.readText){
    try{
      const t = await navigator.clipboard.readText();
      if(t && t.includes('youtube.com') || t.includes('youtu.be')){
        urlInput.value = t.trim();
        return true;
      }
    }catch(e){}
  }
  return false;
}

// try paste on load
window.addEventListener('load', async ()=>{
  await readFromClipboard();
});

pasteBtn.addEventListener('click', async ()=>{
  const ok = await readFromClipboard();
  if(!ok) alert('No YouTube link found in clipboard');
});

infoBtn.addEventListener('click', async ()=>{
  const url = urlInput.value.trim();
  if(!url){ alert('Paste a YouTube URL first'); return; }
  infoBtn.disabled = true;
  infoBtn.textContent = 'Fetching…';
  try{
    const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    if(!res.ok) { const j=await res.json().catch(()=>null); alert(j?.error||'Failed to fetch info'); return; }
    const info = await res.json();
    showInfo(info);
  }catch(e){
    alert('Failed to get info: '+e.message);
  }finally{
    infoBtn.disabled = false;
    infoBtn.textContent = 'Get Info';
  }
});

function showInfo(info){
  preview.classList.remove('hidden');
  controls.classList.remove('hidden');
  thumb.src = info.thumbnails && info.thumbnails.length? info.thumbnails[0] : '';
  titleEl.textContent = info.title || 'Untitled';
  uploaderEl.textContent = info.uploader || 'Unknown';
  durationEl.textContent = formatDuration(info.duration);
  descriptionEl.textContent = (info.description||'').slice(0,300);
  filenameInput.value = (info.title||'youtube').replace(/[^a-z0-9\-_. ]/ig,'').slice(0,80);
  // populate qualitySelect
  qualitySelect.innerHTML = '<option value="">Auto (best)</option>';
  // group formats into audio/video compatible
  const formats = info.formats || [];
  // sort prefer higher quality
  formats.sort((a,b)=> (b.height||0)-(a.height||0) || (b.tbr||0)-(a.tbr||0));
  formats.forEach(f=>{
    const label = `${f.format_id} — ${f.ext}${f.height? ' '+f.height+'p':''}${f.abr? ' • '+f.abr+'kbps':''} ${f.filesize? ' • '+fmtBytes(f.filesize):''}`;
    const opt = document.createElement('option');
    opt.value = f.format_id;
    opt.textContent = label;
    qualitySelect.appendChild(opt);
  });
  // estimate size for default best combination (choose first with filesize)
  const firstWithSize = formats.find(f=>f.filesize);
  estimateEl.textContent = firstWithSize ? fmtBytes(firstWithSize.filesize) : 'Unknown';
}

function formatDuration(s){
  if(!s) return '—';
  const hh = Math.floor(s/3600); const mm = Math.floor((s%3600)/60); const ss = Math.floor(s%60);
  return (hh? (hh+':') : '') + String(mm).padStart(hh?2:1,'0') + ':' + String(ss).padStart(2,'0');
}

downloadBtn.addEventListener('click', async ()=>{
  const url = urlInput.value.trim();
  if(!url){ alert('Paste a YouTube URL first'); return; }
  const format = formatSelect.value;
  const format_id = qualitySelect.value;
  const filename = filenameInput.value.trim() || undefined;
  downloadBtn.disabled = true;
  progressEl.textContent = 'Requesting download...';
  try{
    // call download endpoint and stream response with progress
    const params = new URLSearchParams({ url, format });
    if(format_id) params.set('format_id', format_id);
    if(filename) params.set('filename', filename);

    const res = await fetch(`/api/download?${params.toString()}`);
    if(!res.ok){ const j=await res.json().catch(()=>null); alert(j?.error||('Download failed: '+res.status)); return; }

    // get filename from headers
    const disp = res.headers.get('Content-Disposition') || '';
    let suggested = '';
    const m = disp.match(/filename="(.+)"/);
    if(m) suggested = m[1];

    // stream and show progress
    const reader = res.body.getReader();
    const contentLength = +res.headers.get('Content-Length') || null;
    let received = 0;
    const chunks = [];
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      chunks.push(value);
      received += value.length;
      if(contentLength){
        const pct = ((received/contentLength)*100).toFixed(1);
        progressEl.textContent = `Downloading: ${fmtBytes(received)} / ${fmtBytes(contentLength)} (${pct}%)`;
      } else {
        progressEl.textContent = `Downloading: ${fmtBytes(received)} ...`;
      }
    }
    // assemble blob
    const blob = new Blob(chunks);
    const downloadName = suggested || (filename? filename +'.'+format : `download.${format}`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    progressEl.textContent = 'Download complete';
  }catch(e){
    alert('Download error: '+e.message);
    progressEl.textContent = 'Error';
  }finally{
    downloadBtn.disabled = false;
  }
});
