/* Interactive Video - client side logic
   Supports pages: admin, player, parents
   Data model stored in localStorage under "iv_projects" and "iv_sessions"
*/

(function(){
  const LS_PROJECTS = 'iv_projects_v1';
  const LS_SESSIONS = 'iv_sessions_v1';

  function qs(sel, ctx=document) { return ctx.querySelector(sel); }
  function qsa(sel, ctx=document) { return Array.from(ctx.querySelectorAll(sel)); }
  function saveProjects(p) { localStorage.setItem(LS_PROJECTS, JSON.stringify(p||{})); }
  function loadProjects() { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '{}'); }
  function saveSessions(s) { localStorage.setItem(LS_SESSIONS, JSON.stringify(s||[])); }
  function loadSessions() { return JSON.parse(localStorage.getItem(LS_SESSIONS) || '[]'); }

  // Helpers
  function parseTime(v){
    if(!v) return 0;
    v = v.trim();
    if(v.includes(':')){
      const [m,s]=v.split(':').map(Number);
      return (m*60) + (s || 0);
    }
    return Number(v);
  }
  function fmtTime(s){
    s = Math.floor(s||0);
    const m=Math.floor(s/60), sec=s%60;
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }

  // PAGE: ADMIN
  if(window.__PAGE === 'admin'){
    const projSelect = qs('#projSelectAdmin');
    const projName = qs('#projName');
    const createBtn = qs('#createProj');
    const loadBtn = qs('#loadProj');
    const deleteBtn = qs('#deleteProj');
    const videoPreview = qs('#videoPreview');
    const localVideoInput = qs('#localVideoInput');
    const youtubeUrl = qs('#youtubeUrl');
    const saveVideoBtn = qs('#saveVideo');
    const qType = qs('#qType');
    const extraFields = qs('#extraFields');
    const addInteractionBtn = qs('#addInteraction');
    const timestampInput = qs('#timestamp');
    const hintInput = qs('#hintText');
    const interactionList = qs('#interactionList');
    const exportBtn = qs('#exportProj');
    const importBtn = qs('#importProj');
    const importFile = qs('#importFile');

    let projects = loadProjects();
    let currentProjectKey = null;
    let currentProject = null;
    let uploadedDiagramDataUrl = null;

    function refreshProjectSelect(){
      projSelect.innerHTML = '';
      const keys = Object.keys(projects);
      keys.forEach(k=>{
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = projects[k].name || k;
        projSelect.appendChild(opt);
      });
      // also populate top create dropdown in admin header if present
      const top = qs('#projSelect');
      if(top) {
        top.innerHTML = '';
        keys.forEach(k=>{
          const o=document.createElement('option'); o.value=k; o.textContent=projects[k].name||k;
          top.appendChild(o);
        });
      }
    }
    function init(){
      refreshProjectSelect();
      bindEvents();
      renderExtraFields();
    }
    function bindEvents(){
      createBtn.onclick = ()=>{
        const name = (projName.value||'').trim();
        if(!name){ alert('Please give a name'); return; }
        const key = 'proj_' + Date.now();
        projects[key] = { name, video: null, interactions: [] };
        saveProjects(projects);
        refreshProjectSelect();
        projName.value='';
        alert('Project created. Select it then click Load.');
      };
      loadBtn.onclick = ()=>{
        const k = projSelect.value;
        if(!k) { alert('Select a project'); return; }
        currentProjectKey = k;
        currentProject = projects[k];
        renderProject();
      };
      deleteBtn.onclick = ()=>{
        const k=projSelect.value;
        if(!k) return alert('Select a project');
        if(!confirm('Delete project and all interactions?')) return;
        delete projects[k];
        saveProjects(projects);
        currentProjectKey=null; currentProject=null;
        refreshProjectSelect();
        interactionList.innerHTML='';
        videoPreview.innerHTML='';
      };

      saveVideoBtn.onclick = async ()=>{
        if(!currentProject){ alert('Load a project first'); return;}
        // prefer local file if chosen
        const file = localVideoInput.files[0];
        if(file){
          const url = URL.createObjectURL(file);
          currentProject.video = { type: 'local', url, name: file.name, blobName: file.name };
          // Note: object URL will not persist past session; better to encourage upload to repo for persistent hosting.
        } else if(youtubeUrl.value.trim()){
          currentProject.video = { type: 'youtube', url: youtubeUrl.value.trim() };
        } else {
          alert('Choose a local video or paste a YouTube URL');
          return;
        }
        projects[currentProjectKey] = currentProject;
        saveProjects(projects);
        renderProject();
        alert('Video source saved in project (persisted in localStorage). For long-term hosting, upload assets to repo.');
      };

      qType.onchange = renderExtraFields;

      addInteractionBtn.onclick = async ()=>{
        if(!currentProject){ alert('Load a project first'); return; }
        const t = parseTime(timestampInput.value);
        const type = qType.value;
        const base = { id: 'i_'+Date.now(), ts: t, type, hint: hintInput.value||'', createdAt: Date.now() };

        // collect type-specific fields
        if(type === 'mcq'){
          const qText = qs('#qText', extraFields).value||'';
          const opts = qsa('.opt', extraFields).map(i=>i.value||'');
          const correctIdx = Number(qs('#correctIdx', extraFields).value||0);
          base.payload = { qText, options: opts, correctIdx };
        } else if(type === 'fill'){
          const qText = qs('#qText', extraFields).value||'';
          const correctAnswer = qs('#correctAnswer', extraFields).value||'';
          base.payload = { qText, correctAnswer };
        } else if(type === 'tf'){
          const qText = qs('#qText', extraFields).value||'';
          const correctTF = qs('#correctTF', extraFields).value === 'true';
          base.payload = { qText, correctTF };
        } else if(type === 'match'){
          const left = (qs('#leftItems', extraFields).value||'').split(',').map(s=>s.trim()).filter(Boolean);
          const right = (qs('#rightItems', extraFields).value||'').split(',').map(s=>s.trim()).filter(Boolean);
          if(left.length !== right.length) return alert('Left and right must have same count.');
          base.payload = { left, right };
        } else if(type === 'colour'){
          // diagram file and hotspots/colors
          const fileInput = qs('#diagramFile', extraFields);
          const hotspots = (qs('#hotspots', extraFields).value||'').split(';').map(s=>s.trim()).filter(Boolean);
          const colors = (qs('#hotspotColors', extraFields).value||'').split(';').map(s=>s.trim()).filter(Boolean);
          if(!fileInput.files[0]){
            return alert('Please upload diagram image for colour interaction.');
          }
          // read diagram as dataURL
          const dataUrl = await fileToDataUrl(fileInput.files[0]);
          base.payload = { diagram: dataUrl, hotspots, colors };
        }

        currentProject.interactions.push(base);
        currentProject.interactions.sort((a,b)=>a.ts - b.ts);
        projects[currentProjectKey] = currentProject;
        saveProjects(projects);
        renderProject();
        timestampInput.value=''; hintInput.value='';
        alert('Interaction added.');
      };

      exportBtn.onclick = ()=>{
        if(!currentProject) return alert('Load a project first');
        const blob = new Blob([JSON.stringify(currentProject, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download = (currentProject.name||'project') + '.json'; a.click();
      };

      importFile.onchange = async (e)=>{
        const f = e.target.files[0];
        if(!f) return;
        try{
          const txt = await f.text();
          const obj = JSON.parse(txt);
          const key = obj.name ? ('proj_' + Date.now()) : ('proj_' + Date.now());
          projects[key] = obj;
          saveProjects(projects);
          refreshProjectSelect();
          alert('Project imported.');
        }catch(err){ alert('Invalid JSON'); }
      };
    }

    function fileToDataUrl(file){
      return new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload = ()=>res(r.result);
        r.onerror=()=>rej();
        r.readAsDataURL(file);
      });
    }

    function renderExtraFields(){
      extraFields.innerHTML = '';
      const t = qType.value;
      const tpl = qs(`#${t}Template`);
      if(!tpl) return;
      extraFields.appendChild(tpl.content.cloneNode(true));
    }

    function renderProject(){
      // show project video and interactions
      interactionList.innerHTML = '';
      if(!currentProject) return;
      qs('#videoPreview').innerHTML = '';
      if(currentProject.video){
        if(currentProject.video.type === 'local'){
          const v = document.createElement('video');
          v.controls = true;
          v.src = currentProject.video.url;
          v.style.maxWidth='100%';
          qs('#videoPreview').appendChild(v);
        } else if(currentProject.video.type === 'youtube'){
          const iframe = document.createElement('iframe');
          iframe.width = "560"; iframe.height = "315";
          iframe.src = currentProject.video.url.replace('watch?v=','embed/');
          iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
          qs('#videoPreview').appendChild(iframe);
        }
      } else {
        qs('#videoPreview').textContent = 'No video saved for this project yet.';
      }

      currentProject.interactions.forEach(int=>{
        const li = document.createElement('li');
        li.innerHTML = `
          <div>
            <strong>${int.type.toUpperCase()}</strong> — ${fmtTime(int.ts)} 
            <div class="meta">${int.payload && (int.payload.qText || (int.payload.left? 'Match items' : 'Colour diagram')) || ''}</div>
          </div>
          <div>
            <button class="edit" data-id="${int.id}">Edit</button>
            <button class="remove" data-id="${int.id}">Remove</button>
          </div>`;
        interactionList.appendChild(li);
      });

      qsa('.remove', interactionList).forEach(btn=>{
        btn.onclick = (ev)=>{
          const id = btn.dataset.id;
          if(!confirm('Remove interaction?')) return;
          currentProject.interactions = currentProject.interactions.filter(i=>i.id !== id);
          projects[currentProjectKey] = currentProject;
          saveProjects(projects);
          renderProject();
        };
      });

      // TODO: editing interactions could be added (not implemented in prototype)
    }

    init();
  }

  // PAGE: PLAYER
  if(window.__PAGE === 'player'){
    const startBtn = qs('#startBtn');
    const playerArea = qs('#playerArea');
    const videoContainer = qs('#videoContainer');
    const projectSelect = qs('#projectSelect');
    const studentNameInput = qs('#studentName');
    const modal = qs('#interactionModal');
    const interactionContent = qs('#interactionContent');
    const checkBtn = qs('#checkBtn');
    const skipBtn = qs('#skipBtn');
    const hintBtn = qs('#hintBtn');
    const feedback = qs('#feedback');
    const revisitBtn = qs('#revisitBtn');
    const statusLabel = qs('#status');

    let projects = loadProjects();
    let sessions = loadSessions();
    let currentProjectKey = null;
    let currentProject = null;
    let player = null; // {type:'local'|'youtube', el:videoElement|iframe, youtubePlayer?}
    let interactionsQueue = [];
    let pendingInteraction = null;
    let currentSession = null;

    function refreshProjectSelect(){
      projectSelect.innerHTML = '';
      Object.keys(projects).forEach(k=>{
        const o=document.createElement('option'); o.value=k; o.textContent=projects[k].name || k;
        projectSelect.appendChild(o);
      });
    }

    function init(){
      refreshProjectSelect();
      bind();
    }

    function bind(){
      startBtn.onclick = ()=>{
        const name = (studentNameInput.value||'').trim();
        if(!name){ alert('Please enter student name'); return; }
        const selected = projectSelect.value;
        if(!selected){ alert('Select a project'); return; }
        currentProjectKey = selected;
        currentProject = projects[selected];
        // init session
        currentSession = {
          sessionId: 's_'+Date.now(),
          projectKey: currentProjectKey,
          projectName: currentProject.name,
          studentName: name,
          startedAt: Date.now(),
          interactions: [], // records of {id, tsShown, answeredAt, attempts, correct, skipped, timeSpent}
        };
        sessions.push(currentSession);
        saveSessions(sessions);
        studentNameInput.value = name;
        startPlayer();
      };

      revisitBtn.onclick = ()=> {
        // show a simple list of skipped interactions for revisit
        if(!currentProject) return alert('Load a session first.');
        const skipped = currentSession.interactions.filter(i=>i.skipped);
        if(skipped.length === 0) return alert('No skipped interactions in this session.');
        // queue skipped items (by original order)
        interactionsQueue = skipped.map(si => {
          const int = currentProject.interactions.find(x=>x.id === si.id);
          return Object.assign({}, int, {revisit:true});
        });
        statusLabel.textContent = `Revisiting ${interactionsQueue.length} skipped items`;
        playNext();
      };
    }

    function startPlayer(){
      // render video element or youtube iframe and wire tracking
      playerArea.classList.remove('hidden');
      videoContainer.innerHTML = '';
      interactionsQueue = [...(currentProject.interactions || [])];
      // build a simple map for quick access
      interactionsQueue.sort((a,b)=>a.ts - b.ts);

      if(currentProject.video && currentProject.video.type === 'local'){
        const v = document.createElement('video');
        v.src = currentProject.video.url;
        v.controls = true;
        v.autoplay = false;
        v.preload = 'metadata';
        v.style.maxWidth = '100%';
        videoContainer.appendChild(v);
        player = { type:'local', el: v };
        v.addEventListener('timeupdate', onTimeUpdate);
        v.addEventListener('play', ()=>statusLabel.textContent='Playing');
        v.addEventListener('pause', ()=>statusLabel.textContent='Paused');
      } else if(currentProject.video && currentProject.video.type === 'youtube'){
        // insert iframe and use YouTube Iframe API (simple approach: seek/pause by postMessage may be limited)
        // We'll embed via iframe embed URL and use the YT API when available
        const videoId = extractYouTubeId(currentProject.video.url);
        if(!videoId){
          videoContainer.textContent = 'Invalid YouTube URL saved in project.';
          return;
        }
        const id = 'ytplayer_' + Date.now();
        const div = document.createElement('div'); div.id = id; videoContainer.appendChild(div);

        // create YT player
        if(!window.YT){
          // load API
          const tag = document.createElement('script');
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
          window.onYouTubeIframeAPIReady = ()=> createYT();
        } else createYT();

        function createYT(){
          const YTplayer = new YT.Player(id, {
            height: '360',
            width: '640',
            videoId: videoId,
            events: {
              'onReady': (e)=> {
                player = { type: 'youtube', el: e.target.getIframe(), yt: e.target };
                // attach polling for timeupdate
                setInterval(()=> {
                  if(player && player.yt && player.yt.getPlayerState){
                    const st = player.yt.getPlayerState();
                    if(st === 1){ // playing
                      const t = player.yt.getCurrentTime();
                      onTimeUpdateYT(t);
                    }
                  }
                }, 500);
              }
            }
          });
        }
      } else {
        videoContainer.textContent = 'No video configured for this project.';
      }

      statusLabel.textContent = 'Ready';
    }

    function extractYouTubeId(url){
      try{
        const u = new URL(url);
        if(u.hostname.includes('youtube.com')){
          return u.searchParams.get('v');
        }
        if(u.hostname === 'youtu.be') return u.pathname.slice(1);
      }catch(e){}
      return null;
    }

    // For local video
    function onTimeUpdate(ev){
      const t = ev.target.currentTime;
      checkInteractionsAtTime(t);
    }
    // For youtube polling
    function onTimeUpdateYT(t){
      checkInteractionsAtTime(t);
    }

    let lastTriggeredIndex = -1;
    function checkInteractionsAtTime(t){
      if(!interactionsQueue || interactionsQueue.length === 0) return;
      // find next interaction not yet shown in this session
      const remaining = interactionsQueue.filter(i=>{
        const alreadyShown = currentSession.interactions.find(si => si.id === i.id && !i.revisit);
        // if we're revisiting, interactionsQueue contains revisit flag so we allow it
        if(i.revisit) {
          // allow revisits
          return true;
        }
        return !alreadyShown;
      });
      if(remaining.length === 0) return;
      const next = remaining[0];
      // if current time >= next.ts and not currently displaying a modal
      if(t >= next.ts && !pendingInteraction){
        // pause video, display modal
        pauseVideo();
        showInteraction(next);
      }
    }

    function pauseVideo(){ 
      if(!player) return;
      if(player.type === 'local') player.el.pause();
      else if(player.type === 'youtube' && player.yt && player.yt.pauseVideo) player.yt.pauseVideo();
    }
    function resumeVideo(){
      if(!player) return;
      if(player.type === 'local') player.el.play();
      else if(player.type === 'youtube' && player.yt && player.yt.playVideo) player.yt.playVideo();
    }

    function showInteraction(inter){
      pendingInteraction = inter;
      feedback.textContent = '';
      interactionContent.innerHTML = '';
      hintBtn.style.display = inter.hint ? 'inline-block' : 'none';
      // record show time
      const shownAt = Date.now();

      // render content depending on type
      if(inter.type === 'mcq'){
        const p = document.createElement('div');
        p.innerHTML = `<h3>${inter.payload.qText || 'Question'}</h3>`;
        const opts = inter.payload.options || [];
        opts.forEach((o, idx)=>{
          const b = document.createElement('button');
          b.textContent = o || `Option ${idx+1}`;
          b.className = 'choice';
          b.dataset.idx = idx;
          b.onclick = ()=> {
            // set selected dataset
            p.querySelectorAll('.choice').forEach(c=>c.classList.remove('selected'));
            b.classList.add('selected');
          };
          p.appendChild(b);
        });
        interactionContent.appendChild(p);
      } else if(inter.type === 'fill'){
        const p = document.createElement('div');
        p.innerHTML = `<h3>${inter.payload.qText || 'Fill in the blank'}</h3>`;
        const inp = document.createElement('input'); inp.id='fillAnswer';
        p.appendChild(inp);
        interactionContent.appendChild(p);
      } else if(inter.type === 'tf'){
        const p = document.createElement('div');
        p.innerHTML = `<h3>${inter.payload.qText || 'Statement'}</h3>`;
        const toggle = document.createElement('button');
        toggle.id='tfToggle';
        toggle.textContent = 'Select True';
        toggle.dataset.value = 'true';
        toggle.onclick = ()=> {
          if(toggle.dataset.value === 'true'){ toggle.dataset.value = 'false'; toggle.textContent='Select False'; }
          else { toggle.dataset.value='true'; toggle.textContent='Select True'; }
        };
        p.appendChild(toggle);
        interactionContent.appendChild(p);
      } else if(inter.type === 'match'){
        // simple drag & drop
        const p = document.createElement('div');
        p.innerHTML = `<h3>Match the following</h3>`;
        const left = inter.payload.left || [];
        const right = inter.payload.right || [];
        const leftCol = document.createElement('div'); leftCol.className='match-left';
        const rightCol = document.createElement('div'); rightCol.className='match-right';
        left.forEach((L,i)=>{
          const li = document.createElement('div'); li.className='draggable'; li.draggable=true; li.dataset.value = i;
          li.textContent = L;
          leftCol.appendChild(li);
        });
        right.forEach((R,i)=>{
          const slot = document.createElement('div'); slot.className='dropzone'; slot.dataset.index = i;
          slot.textContent = R;
          rightCol.appendChild(slot);
        });
        p.appendChild(leftCol); p.appendChild(rightCol);
        interactionContent.appendChild(p);

        // events
        qsa('.draggable', p).forEach(d=>{
          d.addEventListener('dragstart', ev=>{
            ev.dataTransfer.setData('text/plain', d.dataset.value);
          });
        });
        qsa('.dropzone', p).forEach(z=>{
          z.addEventListener('dragover', ev=>ev.preventDefault());
          z.addEventListener('drop', ev=>{
            ev.preventDefault();
            const v = ev.dataTransfer.getData('text/plain');
            // attach the dragged label text as child
            const dragged = p.querySelector(`.draggable[data-value="${v}"]`);
            if(dragged){
              // if already attached elsewhere, move it
              ev.target.innerHTML = '';
              ev.target.appendChild(dragged);
            }
          });
        });
      } else if(inter.type === 'colour'){
        const p = document.createElement('div');
        p.innerHTML = `<h3>Colour the diagram</h3>`;
        const img = document.createElement('img');
        img.src = inter.payload.diagram;
        img.style.maxWidth='100%';
        img.id = 'colourDiagram';
        img.onload = ()=> {
          // render overlay hotspots as invisible clickable regions
          const wrap = document.createElement('div');
          wrap.style.position='relative';
          wrap.appendChild(img);
          const w = img.naturalWidth, h = img.naturalHeight;
          // wrap size will conform; use percent positions
          inter.payload.hotspots.forEach((hs, idx)=>{
            const [x,y,ww,hh] = hs.split(',').map(p=>parseFloat(p.trim()));
            const overlay = document.createElement('div');
            overlay.className='hotspot';
            overlay.style.position='absolute';
            overlay.style.left = x + '%';
            overlay.style.top = y + '%';
            overlay.style.width = ww + '%';
            overlay.style.height = hh + '%';
            overlay.style.cursor = 'pointer';
            overlay.style.border = '1px dashed rgba(255,255,255,0.25)';
            overlay.dataset.index = idx;
            overlay.onclick = ()=>{
              // fill with chosen color - provide simple color picker
              const color = prompt('Choose color (css name or hex)', inter.payload.colors[idx] || '#ff0000');
              overlay.style.background = color;
              overlay.dataset.chosen = color;
            };
            wrap.appendChild(overlay);
          });
          interactionContent.appendChild(wrap);
        };
        interactionContent.appendChild(p);
      }

      modal.classList.remove('hidden');

      // set up check/skip handlers
      checkBtn.onclick = ()=>{
        const attemptStart = shownAt;
        evaluateInteraction(inter, shownAt);
      };
      skipBtn.onclick = ()=>{
        // mark skipped
        recordInteractionResult(inter.id, { skipped:true, answered:false, attempts:0, timeSpent: (Date.now()-shownAt) });
        closeModal();
        resumeVideo();
      };
      hintBtn.onclick = ()=> {
        alert(inter.hint || 'No hint provided.');
      };
    }

    function evaluateInteraction(inter, shownAt){
      let ok=false;
      let attempts = 1;
      if(inter.type === 'mcq'){
        const sel = interactionContent.querySelector('.choice.selected');
        if(!sel){ feedback.textContent='Please select an option.'; return; }
        const idx = Number(sel.dataset.idx);
        if(idx === inter.payload.correctIdx) ok=true;
      } else if(inter.type === 'fill'){
        const val = (interactionContent.querySelector('#fillAnswer')||{value:''}).value.trim();
        attempts = (recordAttemptCount(inter.id) + 1);
        if(!val){ feedback.textContent='Enter an answer.'; return; }
        if(val.toLowerCase() === (inter.payload.correctAnswer||'').toLowerCase()){
          ok=true;
        } else {
          feedback.textContent = 'Incorrect — try again.';
          // do not close modal; allow retry
          return;
        }
      } else if(inter.type === 'tf'){
        const tbtn = interactionContent.querySelector('#tfToggle');
        const value = tbtn && tbtn.dataset.value === 'true';
        if(value === inter.payload.correctTF) ok=true;
      } else if(inter.type === 'match'){
        // evaluate all dropzones match order: we expect that the element placed in each dropzone has dataset.value that matches index
        const zones = interactionContent.querySelectorAll('.dropzone');
        let all=true;
        zones.forEach((z,i)=>{
          const child = z.querySelector('.draggable');
          if(!child) all=false;
          else {
            const val = Number(child.dataset.value);
            // right ordering: left index should correspond to right index mapping; for our simple model, we expect val === i
            if(val !== i) all=false;
          }
        });
        if(all) ok=true;
      } else if(inter.type === 'colour'){
        // check that each hotspot has chosen color equals payload colors
        const wrap = interactionContent.querySelector('.hotspot') ? interactionContent : null;
        let all=true;
        const overlayElements = interactionContent.querySelectorAll('.hotspot');
        overlayElements.forEach((ov, idx)=>{
          const chosen = ov.dataset.chosen || '';
          const correct = (inter.payload.colors[idx]||'').trim().toLowerCase();
          if(!chosen) all=false;
          if(chosen && chosen.toLowerCase() !== correct && correct !== '') all=false;
        });
        if(all) ok=true;
        else {
          feedback.textContent = 'Not all areas colored correctly — try again.';
          return;
        }
      }

      // If correct
      if(ok){
        recordInteractionResult(inter.id, { skipped:false, answered:true, correct:true, attempts: attempts, timeSpent: Date.now() - shownAt });
        closeModal();
        resumeVideo();
      } else {
        // for MCQ/TF incorrect -> prompt to try again
        feedback.textContent = 'Incorrect — try again.';
        recordInteractionResult(inter.id, { skipped:false, answered:false, correct:false, attempts: 1, timeSpent: Date.now() - shownAt });
        // Do not close modal; allow retry until correct
      }
    }

    function recordAttemptCount(interId){
      const rec = currentSession.interactions.find(i=>i.id === interId);
      return rec ? (rec.attempts || 0) : 0;
    }

    function recordInteractionResult(interId, data){
      // find or create record
      let rec = currentSession.interactions.find(i=>i.id === interId);
      if(!rec){
        rec = { id: interId, shownAt: Date.now(), attempts:0, skipped:false, correct:false, timeSpent:0 };
        currentSession.interactions.push(rec);
      }
      rec.attempts = (rec.attempts || 0) + (data.attempts || 0);
      if(data.skipped) rec.skipped = true;
      if(data.answered) rec.answeredAt = Date.now();
      if(data.correct) rec.correct = true;
      rec.timeSpent = (rec.timeSpent || 0) + (data.timeSpent || 0);
      // persist sessions array
      sessions = loadSessions();
      // update last session
      const idx = sessions.findIndex(s=>s.sessionId === currentSession.sessionId);
      if(idx >= 0) sessions[idx] = currentSession;
      else sessions.push(currentSession);
      saveSessions(sessions);
    }

    function closeModal(){
      pendingInteraction = null;
      modal.classList.add('hidden');
      interactionContent.innerHTML = '';
      feedback.textContent = '';
    }

    function playNext(){
      // resume playback to let queue trigger next item
      resumeVideo();
    }

    init();
  }

  // PAGE: PARENTS
  if(window.__PAGE === 'parents'){
    const list = qs('#sessionsList');
    const exportCSV = qs('#exportAllCSV');
    const exportJSON = qs('#exportAllJSON');

    function render(){
      const sessions = loadSessions();
      if(sessions.length === 0){ list.textContent = 'No sessions recorded yet.'; return; }
      list.innerHTML = '';
      sessions.forEach(s=>{
        const d = document.createElement('div');
        d.className='card';
        d.innerHTML = `
          <h3>${s.projectName} — ${s.studentName}</h3>
          <small>Started: ${new Date(s.startedAt).toLocaleString()}</small>
          <div>
            <strong>Interactions:</strong> ${s.interactions.length} 
            &nbsp; Score: ${computeScore(s)} 
          </div>
          <div>
            <button class="download-json" data-id="${s.sessionId}">Download JSON</button>
            <button class="download-csv" data-id="${s.sessionId}">Download CSV</button>
          </div>
        `;
        list.appendChild(d);
      });

      qsa('.download-json').forEach(b=>{
        b.onclick = ()=>{
          const id = b.dataset.id;
          const s = loadSessions().find(x=>x.sessionId === id);
          const blob = new Blob([JSON.stringify(s, null, 2)], {type:'application/json'});
          const url = URL.createObjectURL(blob);
          const a=document.createElement('a'); a.href=url; a.download=(s.studentName||'session')+'.json'; a.click();
        };
      });
      qsa('.download-csv').forEach(b=>{
        b.onclick = ()=>{
          const id = b.dataset.id;
          const s = loadSessions().find(x=>x.sessionId === id);
          const csv = sessionToCSV(s);
          const blob = new Blob([csv], {type:'text/csv'});
          const url = URL.createObjectURL(blob);
          const a=document.createElement('a'); a.href=url; a.download=(s.studentName||'session')+'.csv'; a.click();
        };
      });
    }
    function computeScore(s){
      const total = s.interactions.length || 0;
      const correct = s.interactions.filter(i=>i.correct).length;
      return `${correct}/${total}`;
    }
    function sessionToCSV(s){
      const rows = [['interactionId','attempts','skipped','correct','timeSpent_ms']];
      s.interactions.forEach(i=>{
        rows.push([i.id, i.attempts||0, !!i.skipped, !!i.correct, i.timeSpent||0]);
      });
      return rows.map(r=>r.map(v=>typeof v==='string' ? `"${v.replace(/"/g,'""')}"` : v).join(',')).join('\n');
    }

    exportCSV.onclick = ()=>{
      const all = loadSessions();
      if(all.length===0) return alert('No sessions');
      // flatten to CSV
      const rows = [['sessionId','studentName','projectName','interactionId','attempts','skipped','correct','timeSpent_ms']];
      all.forEach(s=>{
        s.interactions.forEach(i=>{
          rows.push([s.sessionId, s.studentName, s.projectName, i.id, i.attempts||0, !!i.skipped, !!i.correct, i.timeSpent||0]);
        });
      });
      const csv = rows.map(r=>r.join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download='iv_all_sessions.csv'; a.click();
    };

    exportJSON.onclick = ()=>{
      const all = loadSessions();
      const blob = new Blob([JSON.stringify(all, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download='iv_all_sessions.json'; a.click();
    };

    render();
  }

})();
