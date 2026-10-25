// The categories in the left sidebar fold away: click (or press Enter or Space on) a heading and everything under it folds up into the
// heading, click again and it opens. Each tool remembers which ones were folded. A walkthrough opens whatever it needs to point at
// (window.__expandFor). Each tool page loads this.
(function(){
  const side = document.querySelector('aside'); if (!side) return;
  const key = 'sts-folded:' + (document.title || 'tool').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) {}
  const store = () => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {} };
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function fold(sec, head, folded, animate){
    if (sec.classList.contains('folded') === folded) return;
    const h0 = sec.getBoundingClientRect().height;
    sec.classList.toggle('folded', folded);
    head.setAttribute('aria-expanded', String(!folded));
    if (!animate || calm() || !sec.animate) return;
    const h1 = sec.getBoundingClientRect().height;
    sec.style.overflow = 'hidden'; sec.style.boxSizing = 'border-box';
    const a = sec.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    a.onfinish = a.oncancel = () => { sec.style.overflow = ''; sec.style.boxSizing = ''; };
  }

  function setup(sec){
    const head = [...sec.children].find(c => c.tagName === 'H2');
    if (!head || head.classList.contains('sec-toggle')) return;
    const id = head.textContent.trim().toLowerCase();
    head.classList.add('sec-toggle'); head.tabIndex = 0; head.setAttribute('role', 'button');
    head.setAttribute('aria-expanded', 'true');
    head.setAttribute('data-tip', 'Fold or open\nShows or hides everything under this heading.');
    if (saved[id]) fold(sec, head, true, false);
    const toggle = () => { const f = !sec.classList.contains('folded'); fold(sec, head, f, true); if (f) saved[id] = 1; else delete saved[id]; store(); };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); toggle(); } });
  }

  const all = () => side.querySelectorAll(':scope > section').forEach(setup);
  all();
  new MutationObserver(all).observe(side, { childList: true });

  // a walkthrough, or anything else that needs to show a control, opens the category it is in
  window.__expandFor = el => {
    const sec = el && el.closest && el.closest('aside > section.folded'); if (!sec) return false;
    const head = [...sec.children].find(c => c.tagName === 'H2'); if (head) fold(sec, head, false, false);
    return true;
  };
})();
