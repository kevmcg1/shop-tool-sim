      // runs as the page is read, before the 3D engine downloads: the bar creeps toward a cap as files arrive,
      // and __load.set() moves it (and the cap) on at each real step; __load.done() fills it and fades it out
      (function(){
        var fill = document.getElementById('ldFill'), bar = fill.parentNode, pct = document.getElementById('ldP'), txt = document.getElementById('ldT');
        var p = 0.03, cap = 0.5, done = false;
        // "12 / 31 assets": the shell lists the files this tool needs (window.__ASSETS); each one counts once the browser reports it fetched
        var cEl = document.getElementById('ldC'), want = {}, total = 0, got = 0;
        (window.__ASSETS || []).forEach(function(u){ try { u = new URL(u, document.baseURI).href; } catch (e) {} if (!want[u]){ want[u] = 1; total++; } });
        function drawCount(){ if (cEl && total){ cEl.hidden = false; cEl.textContent = got + ' / ' + total + ' assets'; } }
        function mark(u){ if (want[u] === 1){ want[u] = 2; got++; drawCount(); } }
        // scripts and styles report themselves (a page opened from disk gets no timings for its files, so this is what counts there)
        window.addEventListener('load', function(e){ var t = e.target; if (t && t.tagName && (t.src || t.href)) mark(t.src || t.href); }, true);
        // a file that fails to arrive is named on the loading screen instead of leaving it to sit there
        var failed = [];
        function nameOf(u){ return String(u).split('?')[0].split('/').slice(-2).join('/'); }
        window.addEventListener('error', function(e){ var t = e.target; if (t && t.tagName && (t.src || t.href) && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) failed.push(nameOf(t.src || t.href)); }, true);   // (a file that failed is not counted as loaded)
        window.addEventListener('unhandledrejection', function(e){ var m = String((e.reason && e.reason.message) || e.reason || ''); if (/dynamically imported module|Failed to fetch/i.test(m)) failed.push('the 3D library'); });
        setTimeout(function(){ if (!done && failed.length) txt.textContent = 'Couldn’t load ' + failed.slice(0, 2).join(' and ') + '. Check the connection and reload.'; }, 6000);
        function scanSheets(){ var ls = document.querySelectorAll('link[rel=stylesheet]'); for (var i = 0; i < ls.length; i++) if (ls[i].sheet) mark(ls[i].href); }
        function seeFiles(list){ list.forEach(function(e){ if (want[e.name] === 1){ want[e.name] = 2; got++; } }); drawCount(); }
        function draw(){ fill.style.transform = 'scaleX(' + p + ')'; var n = Math.round(p*100); pct.textContent = n + '%'; bar.setAttribute('aria-valuenow', n); }
        function set(v, label){ if (done) return; p = Math.max(p, v); cap = Math.max(cap, Math.min(0.97, v + 0.3)); if (label) txt.textContent = label; draw(); }
        var timer = setInterval(function(){ if (!done){ p += (cap - p)*0.05; draw(); scanSheets(); } }, 120);
        try { new PerformanceObserver(function(list){ var es = list.getEntries(); es.forEach(function(){ p += (cap - p)*0.25; }); seeFiles(es); if (!done) draw(); }).observe({ type: 'resource', buffered: true }); } catch (e) {}
        window.__load = { set: set, done: function(){
          if (done) return; set(1, 'Ready'); done = true; got = total; drawCount(); clearInterval(timer);
          var el = document.getElementById('loading'); el.classList.add('ld-out'); setTimeout(function(){ el.remove(); }, 350);
        } };
        draw(); drawCount();
      })();
