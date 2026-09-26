(function () {
  'use strict';

  const appZone    = document.getElementById('app-dropzone');
  const editorWrap = document.getElementById('gcode-editor-wrap');
  const dzEditor   = document.getElementById('dropzone-editor');

  if (!appZone) return;

  function hasFiles(e) {
    return e.dataTransfer &&
      Array.from(e.dataTransfer.types || []).includes('Files');
  }

  /* Dropping a file throws away whatever is in the editor, so if there is
     anything there worth losing, ask first. */
  function programInEditor() {
    const t = (typeof gcodeInput !== 'undefined' && gcodeInput) ? gcodeInput.value : '';
    return t.split('\n').some(l => l.trim() && !/^\s*[;(%]/.test(l));
  }

  function handleFile(file) {
    if (!file) return;
    const go = () => {
      const reader = new FileReader();
      reader.onload = ev => {
        loadGCode(ev.target.result);
        rewindSimToStart();
        showToast('File loaded', file.name + ' has replaced the program in the editor.');
      };
      reader.readAsText(file);
    };

    if (!programInEditor()) { go(); return; }
    if (window.ConfirmBox) window.ConfirmBox.ask({
      title: 'Replace the program?',
      body: 'There is already a program in the editor. Opening <b>' +
            String(file.name).replace(/[<>&]/g, '') +
            '</b> throws it away and reads the new one straight in.',
      yes: "Let's do it!",
      no: 'Keep what I have',
      onYes: go,
    });
    else go();
  }

  let appDragDepth = 0;

  function showAppOverlay()  { appZone.classList.add('active'); }
  function hideAppOverlay()  { appZone.classList.remove('active'); }

  window.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    appDragDepth++;
    showAppOverlay();
  }, false);

  window.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, false);

  window.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    appDragDepth = Math.max(0, appDragDepth - 1);
    if (appDragDepth === 0) hideAppOverlay();
  }, false);

  window.addEventListener('drop', e => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    appDragDepth = 0;
    hideAppOverlay();

    if (dzEditor) dzEditor.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  }, false);

  if (editorWrap && dzEditor) {
    let editorDragDepth = 0;

    editorWrap.addEventListener('dragenter', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      editorDragDepth++;
      dzEditor.classList.add('dragover');
    });

    editorWrap.addEventListener('dragleave', e => {
      if (!hasFiles(e)) return;
      editorDragDepth = Math.max(0, editorDragDepth - 1);
      if (editorDragDepth === 0) dzEditor.classList.remove('dragover');
    });

    editorWrap.addEventListener('dragover', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    editorWrap.addEventListener('drop', () => {
      editorDragDepth = 0;
      dzEditor.classList.remove('dragover');
    });
  }
})();

let parseTimer;
let parsePending = false;
let lastPasteAt  = 0;

function flushParseNow() {
  clearTimeout(parseTimer);
  parsePending = false;
  try {
    allSegments = parseGCodeWithComp(gcodeInput.value);
    buildTimeline(simSegments);
    simSeekToTime(simTotalTime);
    updateStats(allSegments, gcodeInput.value);
    setStatus(allSegments.length, false);
    buildCompOverlay();
    if (typeof renderCompPanel === 'function') renderCompPanel();
  } catch(e){ setStatus(0, true); }
}

gcodeInput.addEventListener('input',()=>{
  updateHighlight();
  clearTimeout(parseTimer);
  parsePending = true;
  parseTimer=setTimeout(()=>{
    parsePending = false;
    try {
      allSegments=parseGCodeWithComp(gcodeInput.value);
      buildTimeline(simSegments);
      simSeekToTime(simTotalTime);
      updateStats(allSegments,gcodeInput.value);
      setStatus(allSegments.length,false);
      buildCompOverlay();
      if (typeof renderCompPanel === 'function') renderCompPanel();
    } catch(e){ setStatus(0,true); }
  },80);
});

gcodeInput.addEventListener('paste', () => {
  lastPasteAt = Date.now();
  setTimeout(flushParseNow, 0);
});

let rDrag=false,rStartY=0,rStartH=0;
resizeHandle.addEventListener('mousedown',e=>{rDrag=true;rStartY=e.clientY;rStartH=editorPanel.offsetHeight;e.preventDefault();});
window.addEventListener('mousemove',e=>{
  if(!rDrag)return;
  const delta=rStartY-e.clientY;
  editorPanel.style.height=Math.max(80,Math.min(window.innerHeight*0.7,rStartH+delta))+'px';

  mainRenderer.setSize(viewport.clientWidth,viewport.clientHeight);
  updateFrustum();
  mainRenderer.render(mainScene,mainCam);
});
window.addEventListener('mouseup',()=>{rDrag=false;});
