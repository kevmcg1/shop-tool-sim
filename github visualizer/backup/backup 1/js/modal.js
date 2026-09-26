const ModalSystem = (function() {
  function open(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('show');
  }
  function close(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('show');
  }
  function switchTab(modal, tabId) {

    modal.querySelectorAll('.modal-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    modal.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === tabId);
    });
  }
  function init() {

    document.getElementById('btn-guide').addEventListener('click', () => open('guide-modal'));
    document.getElementById('btn-settings').addEventListener('click', () => open('settings-modal'));

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.close));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {

        if (e.target === overlay) overlay.classList.remove('show');
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
      }
    });

    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const modal = tab.closest('.modal-overlay');
        if (modal) switchTab(modal, tab.dataset.tab);
      });
    });
  }
  return { init, open, close };
})();
ModalSystem.init();

(function initSidebarAccordion(){

  function openBody(body) {
    body.style.maxHeight = body.scrollHeight + 'px';
    clearTimeout(body._relax);
    body._relax = setTimeout(() => {
      if (body.previousElementSibling.classList.contains('open')) body.style.maxHeight = 'none';
    }, 300);
  }
  function closeBody(body) {
    clearTimeout(body._relax);

    body.style.maxHeight = body.scrollHeight + 'px';

    body.offsetHeight;
    body.style.maxHeight = '0';
  }

  document.querySelectorAll('#sidebar .sec-head').forEach(head => {
    const body = head.nextElementSibling;
    if (!body || !body.classList.contains('sec-body')) return;

    if (head.classList.contains('open')) {
      body.style.transition = 'none';
      body.style.maxHeight  = 'none';
      body.style.opacity    = '1';

      requestAnimationFrame(() => requestAnimationFrame(() => {
        body.style.transition = '';
      }));
    }

    head.addEventListener('click', () => {
      const isOpen = head.classList.toggle('open');
      if (isOpen) openBody(body);
      else        closeBody(body);
    });
  });
})();

(function initProgressFill(){
  const slider = document.getElementById('viewport-progress-slider');
  if (!slider) return;
  const apply = () => {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--progress', pct + '%');
  };
  slider.addEventListener('input', apply);

  const tick = () => { apply(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();
