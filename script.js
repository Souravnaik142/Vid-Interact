// Interactive Video Player - starter script
// Works with HTML5 video or YouTube iframe. Stores interactions in localStorage and exports CSV.

let isAdmin = false;
const videoEl = document.getElementById('video');
const ytDiv = document.getElementById('ytPlayer');
const fileInput = document.getElementById('fileInput');
const ytUrlInput = document.getElementById('ytUrl');
const loadYtBtn = document.getElementById('loadYt');
const adminToggle = document.getElementById('adminToggle');
const interactionsList = document.getElementById('interactionsList');
const addBtn = document.getElementById('addInteraction');
const useCurBtn = document.getElementById('useCurrentTime');
const timestampInput = document.getElementById('timestamp');
const typeSelect = document.getElementById('interactionType');
const overlay = document.getElementById('interactionOverlay');
const interactionContent = document.getElementById('interactionContent');
const skipBtn = document.getElementById('skipBtn');
const checkBtn = document.getElementById('checkBtn');
const curTimeSpan = document.getElementById('curTime');
const exportCsvBtn = document.getElementById('exportCsv');
const parentEmailInput = document.getElementById('parentEmail');

let useYouTube = false;
let ytPlayer = null;
let ytReady = false;
let interactions = []; // {id, time, type, payload}
let scheduledIdx = 0;
let attempts = []; // saved attempts for parents

// load from localStorage if present
function loadState(){
  const s = localStorage.getItem('iv_interactions_v1');
  if(s) interactions = JSON.parse(s);
  const a = localStorage.getItem('iv_attempts_v1');
  if(a) attempts = JSON.parse(a);
  renderInteractions();
}
function saveState(){
  localStorage.setItem('iv_interactions_v1', JSON.stringify(interactions));
  localStorage.setItem('iv_attempts_v1', JSON.stringify(attempts));
}

// --- player helpers ---
function getCurrentTime(){
  if(useYouTube && ytPlayer && ytReady){
    return ytPlayer.getCurrentTime();
  } else {
    return videoEl.currentTime || 0;
  }
}
function pausePlayer(){
  if(useYouTube && ytPlayer && ytReady) ytPlayer.pauseVideo();
  else videoEl.pause();
}
function playPlayer(){
  if(useYouTube && ytPlayer && ytReady) ytPlayer.playVideo();
  else videoEl.play();
}
function seekPlayer(t){
  if(useYouTube && ytPlayer && ytReady) ytPlayer.seekTo(t, true);
  else videoEl.currentTime = t;
}

// update current time frequently
setInterval(()=> {
  curTimeSpan.textContent = getCurrentTime().toFixed(2);
}, 200);

// file upload local video
fileInput.addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  useYouTube = false;
  ytDiv.style.display = 'none';
  videoEl.style.display = 'block';
  if (window.URL) {
    videoEl.src = URL.createObjectURL(f);
  } else {
    // fallback
    const reader = new FileReader();
    reader.onload = () => { videoEl.src = reader.result; };
    reader.readAsDataURL(f);
  }
});

// load YouTube
loadYtBtn.addEventListener('click', ()=>{
  const url = ytUrlInput.value.trim();
  const id = parseYouTubeId(url);
  if(!id){ alert('Invalid YouTube URL or id'); return; }
  useYouTube = true;
  videoEl.style.display = 'none';
  ytDiv.style.display = 'block';
  loadYouTubePlayer(id);
});

// parse YT id (simple)
function parseYouTubeId(url){
  if(!url) return null;
  // if plain id
  if(/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  const m = url.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// YouTube API: onYouTubeIframeAPIReady will be called by the YT script
window.onYouTubeIframeAPIReady = function(){
  // placeholder — we create player when user loads a URL
  console.log('YT API ready');
};

// create/recreate the player
function loadYouTubePlayer(videoId){
  if(ytPlayer){
    ytPlayer.loadVideoById(videoId);
    return;
  }
  ytReady = false;
  ytPlayer = new YT.Player('ytPlayer', {
    height: '360',
    width: '640',
    videoId: videoId,
    playerVars: {playsinline:1,origin:location.origin},
    events: {
      onReady: (e) => { ytReady=true; console.log('yt ready'); },
      onStateChange: (e) => {
        // if playing, start scheduling
      }
    }
  });
}

// admin toggle
adminToggle.addEventListener('change', (e)=>{
  isAdmin = e.target.checked;
  document.getElementById('editor').style.display = isAdmin ? 'block' : 'none';
});

// use current time button
useCurBtn.addEventListener('click', ()=>{
  const t = getCurrentTime().toFixed(2);
  timestampInput.value = t;
});

// add interaction
addBtn.addEventListener('click', ()=>{
  const t = parseFloat(timestampInput.value);
  if(isNaN(t) || t < 0){ alert('Set a valid timestamp (seconds)'); return; }
  const type = typeSelect.value;
  // create a default payload depending on type
  const payload = defaultPayloadForType(type);
  const id = 'i_' + Date.now();
  interactions.push({id, time: t, type, payload});
  interactions.sort((a,b)=> a.time - b.time);
  saveState();
  renderInteractions();
  timestampInput.value = '';
});

// default payloads
function defaultPayloadForType(type){
  switch(type){
    case 'mcq':
      return {question:'New question', options:['A','B','C','D'], correct:0};
    case 'fill':
      return {question:'Fill this in...', answer:'answer', hint:'Try a word'};
    case 'tf':
      return {question:'Statement...', answer:true};
    case 'match':
      return {question:'Match items', left:['A1','A2'], right:['B1','B2']};
    case 'color':
      return {question:'Colour spots', spots:['spot1','spot2'], correct:{}};
    default:
      return {};
  }
}

function renderInteractions(){
  interactionsList.innerHTML = '';
  interactions.forEach((it, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="meta">
        <strong>${it.type.toUpperCase()}</strong> — ${it.time.toFixed(2)}s<br>
        <span class="small">${summaryOf(it)}</span>
      </div>
      <div class="actions">
        <button data-id="${it.id}" class="edit">Edit</button>
        <button data-id="${it.id}" class="del">Delete</button>
      </div>
    `;
    interactionsList.appendChild(li);
    li.querySelector('.del').addEventListener('click', ()=> {
      interactions = interactions.filter(x=>x.id!==it.id);
      saveState();
      renderInteractions();
    });
    li.querySelector('.edit').addEventListener('click', ()=>{
      openEditorFor(it);
    });
  });
}

function summaryOf(it){
  if(it.type==='mcq') return it.payload.question;
  if(it.type==='fill') return it.payload.question;
  if(it.type==='tf') return it.payload.question;
  if(it.type==='match') return it.payload.question;
  if(it.type==='color') return it.payload.question;
  return '';
}

// open a quick editor modal (simple prompt-based to keep starter small)
function openEditorFor(it){
  // For more advanced UI, build rich modal. Quick approach:
  if(it.type === 'mcq'){
    const q = prompt('Question text:', it.payload.question) || it.payload.question;
    it.payload.question = q;
    for(let i=0;i<4;i++){
      const o = prompt(`Option ${i+1}:`, it.payload.options[i]||'');
      if(o !== null) it.payload.options[i] = o;
    }
    const ci = prompt('Correct option index (0-3):', it.payload.correct);
    const ciNum = parseInt(ci);
    if(!isNaN(ciNum)) it.payload.correct = Math.max(0, Math.min(3,ciNum));
  } else if(it.type==='fill'){
    it.payload.question = prompt('Question:', it.payload.question) || it.payload.question;
    it.payload.answer = prompt('Expected answer:', it.payload.answer) || it.payload.answer;
    it.payload.hint = prompt('Hint:', it.payload.hint) || it.payload.hint;
  } else if(it.type==='tf'){
    it.payload.question = prompt('Statement:', it.payload.question) || it.payload.question;
    const ans = prompt('Correct (true/false):', it.payload.answer?'true':'false');
    it.payload.answer = (ans && ans.toLowerCase()==='true');
  } else if(it.type==='match'){
    it.payload.question = prompt('Title:', it.payload.question) || it.payload.question;
    const left = prompt('Left column items (comma separated):', it.payload.left.join(',')) || it.payload.left.join(',');
    const right = prompt('Right column items (comma separated):', it.payload.right.join(',')) || it.payload.right.join(',');
    it.payload.left = left.split(',').map(s=>s.trim());
    it.payload.right = right.split(',').map(s=>s.trim());
  } else if(it.type==='color'){
    it.payload.question = prompt('Title:', it.payload.question) || it.payload.question;
    const spots = prompt('Spots comma separated:', (it.payload.spots||[]).join(',')) || (it.payload.spots||[]).join(',');
    it.payload.spots = spots.split(',').map(s=>s.trim()).filter(Boolean);
  }
  // Allow editing time too:
  const t = prompt('Timestamp (seconds):', it.time);
  const tn = parseFloat(t);
  if(!isNaN(tn)) it.time = Math.max(0, tn);
  interactions.sort((a,b)=> a.time - b.time);
  saveState();
  renderInteractions();
}

// scheduling: check every 300ms if there is an interaction to show
setInterval(()=>{
  if(!interactions.length) return;
  const t = getCurrentTime();
  // find first not-yet-shown interaction with time <= t + small epsilon
  // We'll mark interactions as "shown" for the current play session via a Set
  if(typeof window._shown === 'undefined') window._shown = new Set();
  for(const it of interactions){
    if(window._shown.has(it.id)) continue;
    if(t + 0.25 >= it.time && t >= it.time - 0.5){
      // trigger it
      window._shown.add(it.id);
      showInteraction(it);
      break;
    }
  }
}, 300);

// show overlay for an interaction
function showInteraction(it){
  pausePlayer();
  overlay.classList.remove('hidden');
  renderInteractionUI(it);
  // attach handlers for skip/check
  skipBtn.onclick = () => {
    overlay.classList.add('hidden');
    playPlayer();
  };
  checkBtn.onclick = () => {
    // evaluate depending on type
    const result = evaluateInteractionFromUI(it);
    // save attempt
    const parentEmail = parentEmailInput.value.trim();
    attempts.push({
      time: new Date().toISOString(),
      videoTime: it.time,
      type: it.type,
      question: it.payload.question || '',
      result,
      parentEmail
    });
    saveState();
    // show feedback then continue
    alert(result.message);
    overlay.classList.add('hidden');
    playPlayer();
  };
}

// render interaction UI inside overlay
function renderInteractionUI(it){
  interactionContent.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'interaction-ui';
  // Show a label with time
  const h = document.createElement('h3');
  h.textContent = `${it.type.toUpperCase()} — ${it.time.toFixed(2)}s`;
  wrap.appendChild(h);

  if(it.type === 'mcq'){
    const q = document.createElement('p'); q.textContent = it.payload.question;
    wrap.appendChild(q);
    it.payload.options.forEach((opt, idx)=>{
      const label = document.createElement('label');
      label.style.display='block';
      const r = document.createElement('input');
      r.type='radio'; r.name='mcq_choice'; r.value=idx;
      label.appendChild(r);
      label.appendChild(document.createTextNode(' ' + opt));
      wrap.appendChild(label);
    });
  } else if(it.type === 'fill'){
    const q = document.createElement('p'); q.textContent = it.payload.question;
    wrap.appendChild(q);
    const hint = document.createElement('small'); hint.textContent = 'Hint: ' + (it.payload.hint||'');
    wrap.appendChild(hint);
    const inp = document.createElement('input'); inp.id='fill_input';
    inp.placeholder='Type your answer';
    wrap.appendChild(inp);
  } else if(it.type === 'tf'){
    const q = document.createElement('p'); q.textContent = it.payload.question;
    wrap.appendChild(q);
    const tBtn = document.createElement('button'); tBtn.textContent='True'; tBtn.onclick=()=>{ document.querySelectorAll('.tfbtn').forEach(b=>b.classList.remove('sel')); tBtn.classList.add('sel'); };
    const fBtn = document.createElement('button'); fBtn.textContent='False'; fBtn.onclick=()=>{ document.querySelectorAll('.tfbtn').forEach(b=>b.classList.remove('sel')); fBtn.classList.add('sel'); };
    tBtn.className='tfbtn'; fBtn.className='tfbtn';
    wrap.appendChild(tBtn); wrap.appendChild(fBtn);
  } else if(it.type === 'match'){
    const q = document.createElement('p'); q.textContent = it.payload.question;
    wrap.appendChild(q);
    // simple matching UI: left list and dropdowns for right
    const leftCol = document.createElement('div'); leftCol.style.display='flex'; leftCol.style.gap='16px';
    const leftList = document.createElement('ul'); leftList.style.listStyle='none'; leftList.style.padding='0';
    const rightSelects = document.createElement('div');
    it.payload.left.forEach((l, idx)=>{
      const li = document.createElement('li'); li.textContent = l;
      leftList.appendChild(li);
      // select
      const sel = document.createElement('select'); sel.dataset.leftIndex = idx;
      it.payload.right.forEach((r, j)=> {
        const opt = document.createElement('option'); opt.value = j; opt.textContent = r;
        sel.appendChild(opt);
      });
      rightSelects.appendChild(sel);
    });
    leftCol.appendChild(leftList);
    leftCol.appendChild(rightSelects);
    wrap.appendChild(leftCol);
  } else if(it.type === 'color'){
    const q = document.createElement('p'); q.textContent = it.payload.question;
    wrap.appendChild(q);
    // clickable spots are just buttons representing labelled spots
    const spotsDiv = document.createElement('div');
    it.payload.spots.forEach((s, idx)=>{
      const d = document.createElement('div'); d.style.display='inline-block'; d.style.margin='8px';
      const b = document.createElement('button'); b.textContent = s; b.dataset.spot = s;
      b.onclick = ()=> {
        const color = prompt('Choose a color name or hex for ' + s + ':', '#ff0000');
        if(color!=null) b.dataset.color = color;
        b.style.border = '2px solid #fff';
      };
      d.appendChild(b);
      spotsDiv.appendChild(d);
    });
    wrap.appendChild(spotsDiv);
  }

  interactionContent.appendChild(wrap);
}

// evaluate answers provided by UI
function evaluateInteractionFromUI(it){
  if(it.type === 'mcq'){
    const radios = document.querySelectorAll('input[name="mcq_choice"]');
    let chosen = null;
    radios.forEach(r => { if(r.checked) chosen = parseInt(r.value); });
    const correct = it.payload.correct;
    const ok = chosen === correct;
    return {ok, chosen, correct, message: ok ? 'Correct!' : `Wrong. Correct answer index: ${correct}`};
  } else if(it.type === 'fill'){
    const val = document.getElementById('fill_input').value.trim();
    const ok = val.toLowerCase() === (it.payload.answer||'').toLowerCase();
    return {ok, given: val, expected: it.payload.answer, message: ok ? 'Correct!' : `Not correct. Expected: ${it.payload.answer}`};
  } else if(it.type === 'tf'){
    const sel = document.querySelector('.tfbtn.sel');
    if(!sel) return {ok:false, message:'No answer selected.'};
    const ans = sel.textContent.toLowerCase() === 'true';
    const ok = ans === Boolean(it.payload.answer);
    return {ok, given: ans, expected: it.payload.answer, message: ok ? 'Correct!' : 'Incorrect.'};
  } else if(it.type === 'match'){
    // gather selects
    const selects = document.querySelectorAll('div[style] > div select, select');
    // fallback to selects inside rightSelects container
    const selElems = document.querySelectorAll('div > div select');
    let correctMatches = 0;
    const total = it.payload.left.length;
    const mapping = [];
    document.querySelectorAll('div[style] > div select, select').forEach((s, idx)=>{
      const sel = s;
      const chosenIdx = parseInt(sel.value);
      mapping.push(chosenIdx);
      if(it.payload.right[chosenIdx] === it.payload.right[idx]) {
        // naive — but we don't know correct mapping, maybe assume same index
        correctMatches += (chosenIdx === idx) ? 1 : 0;
      } else {
        // best-effort: assume correct pair is same index
        if(chosenIdx === idx) correctMatches++;
      }
    });
    const ok = correctMatches === total;
    return {ok, matched: mapping, message: ok ? 'All matched!' : `${correctMatches}/${total} matched (basic check).`};
  } else if(it.type === 'color'){
    const buttons = interactionContent.querySelectorAll('button[data-spot]');
    const chosen = {};
    buttons.forEach(b=> {
      if(b.dataset.color) chosen[b.dataset.spot] = b.dataset.color;
    });
    const filled = Object.keys(chosen).length;
    const ok = filled === it.payload.spots.length;
    return {ok, chosen, message: ok ? 'All spots colored.' : `Colored ${filled}/${it.payload.spots.length} spots.`};
  }
  return {ok:false, message:'Unknown interaction type.'};
}

// export CSV
function exportCSV(){
  const rows = [['timestamp','videoTime','type','question','result_ok','result_details','parentEmail']];
  attempts.forEach(a=>{
    rows.push([
      a.time,
      a.videoTime,
      a.type,
      (a.question||'').replace(/\n/g,' '),
      a.result.ok ? '1' : '0',
      JSON.stringify(a.result).replace(/"/g,'""'),
      a.parentEmail || ''
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='interactive_video_attempts.csv'; a.click();
  URL.revokeObjectURL(url);
}

exportCsvBtn.addEventListener('click', exportCSV);

// simple initial load
loadState();

// video listeners to reset shown set on seek/play to allow repeated interactions if desired
videoEl.addEventListener('seeked', ()=> { window._shown = new Set(); });
videoEl.addEventListener('play', ()=> { /* nothing */ });
videoEl.addEventListener('pause', ()=> { /* nothing */ });
// when using YT, you can hook onStateChange to clear shown when seek occurs (not implemented fully)
window.addEventListener('beforeunload', saveState);

// small helper: make interactions persist across reloads
// (already saved on edits/adds)

// === End of starter script ===
