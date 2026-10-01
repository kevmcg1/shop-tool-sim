// "Show me" (experimental): a hands-on walkthrough of one real measurement with each tool, done on the
// 3D tool itself: you turn the thumb wheel, ratchet or slider by hand, look around, and read each mark
// where it is lit up on the tool. Everything is dimmed except the one thing being shown, and a card
// beside it says what to do, with an arrow pointing at it. Where you do something by hand, a hand shows
// it: it presses where a ring pulses, carries the drag along a marked path (or round the knob) and lets
// go, over and over. Each reading is found again on the flat view (the minimap), whose every part is
// explained. Some steps wait for you to do it yourself, and every step can be skipped. Exit or Esc stops
// it at any time, and whatever it switched on (highlight colors, panels) goes back as it was.
(function(){
  const $ = id => document.getElementById(id);
  const tutBtn = $('tutBtn'); if (!tutBtn) return;

  /* ---------- which tool this is, and its walkthrough ---------- */
  const tool = $('bezelRange') ? (window.__INST === 'vern' ? 'vern' : 'dial')
    : $('zeroAdj') ? 'height' : $('cutT') ? 'depth' : $('coachChk') ? 'mic' : null;
  if (!tool) return;
  const val = id => { const e = $(id); return e ? e.textContent.trim() : ''; };
  const now = (id, pre) => val(id) ? ` ${pre || 'Here that’s'} <b>${val(id)}${/mm|″/.test(val(id)) ? '' : '″'}</b>.` : '';
  // depth mic: the covered hundred thou and 25-thou lines, from the reading cards (null until there is a reading)
  const depA = () => { const v = parseFloat(val('vA')); return isNaN(v) ? null : Math.round(v * 10); };
  const depB = () => { const v = parseFloat(val('vB')); return isNaN(v) ? null : Math.round(v / 0.025); };
  const touching = { dial: () => /on the part|on the bottom/i.test(val('status')), mic: () => /faces on the part/i.test(val('status')),
    depth: () => /rod on the floor/i.test(val('status')), height: () => !!$('contact') && $('contact').classList.contains('ok') };
  touching.vern = touching.dial;
  // wait until it has been backed off and brought back into contact, by hand
  const offThenOn = () => ({ enter: s => { s.phase = 0; }, waitFor: s => { const on = touching[tool](); if (!on) s.phase = 1; return s.phase === 1 && on; } });

  const INTRO = name => ({ title: 'Let’s measure with the ' + name, text: 'I’ll walk you through one real measurement on the 3D tool, one step at a time. Everything except what you need is dimmed, and the arrow points at it. Press <b>Exit</b> or <b>Esc</b> whenever you like.' });
  // "Pick a part" waits for a part to be picked from the list while the step is showing (the walkthrough
  // clears the part first, where the tool has a "no part" choice), and once one is picked, Back passes over it
  const partList = $('sampleSel') || $('partSel');
  let partPicked = false;
  // picking a part while "Pick a part" is showing moves straight on to the next step, no pause
  if (partList) partList.addEventListener('change', () => {
    partPicked = true;
    if (root && STEPS[stepI].part && !STEPS[stepI].done && partList.value !== 'none') partChosen();
  });
  const PART = sel => ({ target: sel, part: true, title: 'Pick a part', text: 'First, choose something to measure from this list.', enter: () => { partPicked = false; }, waitFor: () => false });
  // "Look around" moves on by itself once the view has been dragged round a little (or Next is pressed)
  let looked = 0;
  const LOOK = what => ({ target: '#view', drag: 'look', next: 'Next', enter: () => { looked = 0; }, waitFor: () => looked >= 2, title: 'Look around', text: `Drag on an empty spot to turn the ${what}, the way the hand shows, right-drag to slide it, and scroll to zoom. Try it, then press Next. The camera buttons at the top right bring back a clean view any time.` });
  // the vernier caliper and height gage read inches or millimeters, so their walkthrough starts by asking
  // which; the other tools read inches, and the walkthrough simply switches them to inches
  const CHOOSE = { choose: [['in', 'Inches'], ['mm', 'Millimeters']], title: 'Inches or millimeters?', text: 'Which scale would you like to learn to read? You can run <b>Show me</b> again for the other one any time.' };
  const nowMM = (id, pre) => val(id) ? ` ${pre || 'Here that’s'} <b>${val(id)} mm</b>.` : '';
  // once the walkthrough is done: the quicker ways, next time (dragging the part in and out, Auto measure),
  // pointing at the Auto measure button where the tool has one
  const SHORTCUTS = {
    cal: 'Next time there’s a quicker way: press <b>Auto measure</b>, the lit button, and it opens the jaws and then closes them gently on the part for you.',
    mic: 'You can drag the part in and out between the faces yourself: it slides against the anvil, and whatever feature you leave under the spindle is the one measured. Or press <b>Auto measure</b>, the lit button, and it slides the part in and closes on it with the ratchet for you.',
    depth: 'You can drag the part in and out under the base yourself: the micrometer lifts while the part moves, then seats on its top face. Or press <b>Auto measure</b>, the lit button, and it backs the rod off, slides the part under and runs the rod down with the ratchet for you.',
    height: 'You can drag the part in and out under the scriber yourself: the scriber lifts clear while it moves, and the face it will land on turns green.'
  };
  const SHORT = k => ({ target: '#autoBtn, #view', title: k === 'cal' || k === 'height' ? 'A shortcut for next time' : 'Two shortcuts for next time', text: SHORTCUTS[k] });
  const PRACTICE = { target: '#practiceBtn', title: 'Now try one yourself', text: 'When you’re ready, click <b>Practice</b>. The answers hide, and you read the tool yourself. You can run <b>Show me</b> again any time.' };
  // the jaws or rod close on the part by hand: which way to roll the thumb wheel depends on the part
  const wheelWay = () => { const h = val('fH'); return /open/.test(h) ? ['right', 'open the jaws'] : /extend/.test(h) ? ['right', 'run the depth rod out'] : ['left', 'close the jaws']; };
  const BY_HAND_CAL = { spot: 'Thumb wheel', box: [300, 200], view: 'iso', title: 'Close it on the part by hand', dir: () => wheelWay()[0], drag: true,
    text: () => `The part is in place. Watch the hand: press on the thumb wheel where the ring pulses, hold the button down, and drag it ${wheelWay()[0]} along the arrow to ${wheelWay()[1]} until they touch the part. Hold <b>Shift</b> to feather it in, the way you would by hand.`,
    waitFor: () => touching[tool]() };

  const TOURS = {
    dial: [
      INTRO('dial caliper'),
      PART('.sample-sec .dd, #sampleSel'),
      BY_HAND_CAL,
      LOOK('caliper'),
      { spot: 'inch', view: 'scale', hl: 'inch', flat: 'the inch number', title: 'Read the inch number', text: () => 'The camera is on the beam now. The last whole-inch number the slider edge has passed is outlined in yellow.' + now('vA') },
      { spot: 'tenth', view: 'scale', hl: 'tenth', flat: 'the last hundred-thou line', title: 'Count the hundred-thou lines', text: () => 'Each line after that number is a hundred thou (0.100″). The last line the slider edge has passed is lit up.' + now('vB') },
      { spot: 'dial', view: 'dial', hl: 'dial', flat: 'the dial mark under the needle', title: 'Read the dial', text: () => 'The needle adds the thou: each mark is one thou (0.001″). The mark under the needle is lit up.' + now('vC') },
      { target: '#reading .bd', title: 'Add them up', text: () => 'Inches + hundred thou + dial = the reading. These cards do the adding so you can check your own.' + now('vT', 'This one reads') },
      SHORT('cal'),
      PRACTICE
    ],
    vern: u => [
      CHOOSE,
      INTRO('vernier caliper'),
      PART('.sample-sec .dd, #sampleSel'),
      BY_HAND_CAL,
      LOOK('caliper'),
      ...(u === 'mm' ? [
        { spot: 'inch', view: 'scale', hl: 'inch', flat: 'the centimeter number', title: 'Read the centimeter number', text: () => 'Millimeters are read along the top edge. The last centimeter number the top vernier’s 0 has passed is outlined; each one is 10 mm.' + nowMM('vA') },
        { spot: 'tenth', view: 'scale', hl: 'tenth', flat: 'the last millimeter line', title: 'Count the millimeter lines', text: () => 'Each line after that number is one millimeter. Count the ones the top vernier’s 0 has passed.' + nowMM('vB') },
        { spot: 'vern', view: 'scale', hl: 'vern', flat: 'the vernier line that lines up', loupe: 'loupe', title: 'Find the line that lines up', text: () => 'Now find the one line on the top vernier that meets a beam line exactly. Each vernier line is 0.05 mm, and its numbers 1 to 10 are tenths of a millimeter.' + nowMM('vV') },
        { target: '#reading .bd', title: 'Add them up', text: () => 'Centimeters + millimeter lines + vernier (0.05 mm per line) = the reading in millimeters.' + nowMM('vT', 'This one reads') }
      ] : [
        { spot: 'inch', view: 'scale', hl: 'inch', flat: 'the inch number', title: 'Read the inch number', text: () => 'The camera is on the beam now. The last whole-inch number the vernier’s 0 has passed is outlined.' + now('vA') },
        { spot: 'tenth', view: 'scale', hl: 'tenth', flat: 'the last hundred-thou digit', title: 'Count the hundred-thou digits', text: () => 'The small digits on the beam are a hundred thou (0.100″) each. The last one before the vernier’s 0 is lit up.' + now('vB') },
        { spot: 'sub', view: 'scale', hl: 'sub', flat: 'the last 25-thou line', title: 'Add the 25-thou lines', text: () => 'The short lines after that digit are 25 thou (0.025″) each. Count the ones the vernier’s 0 has passed.' + now('vS') },
        { spot: 'vern', view: 'dial', hl: 'vern', flat: 'the vernier line that lines up', loupe: 'loupe', title: 'Find the line that lines up', text: () => 'Close up on the vernier now. Find the one vernier line that meets a beam line exactly. Each vernier line is one thou (0.001″), so its number is how many thou to add.' + now('vV') },
        { target: '#reading .bd', title: 'Add them up', text: () => 'Inches + hundred thou + 25-thou lines + vernier (one thou per line) = the reading.' + now('vT', 'This one reads') }
      ]),
      SHORT('cal'),
      PRACTICE
    ],
    mic: [
      INTRO('outside micrometer'),
      PART('section:has(#sampleSel) .dd, #sampleSel'),
      Object.assign({ spot: 'Ratchet stop', box: [280, 220], view: 'iso', arrow3d: true, drag: true, title: 'Close it on the part by hand',
        text: 'The part slides in between the anvil and spindle by itself. Now watch the hand: press on the ratchet stop where the ring pulses, hold the button down, and circle round it the way the arrow goes, bringing the spindle down until the ratchet clicks on the part. That click is the right measuring feel.' }, offThenOn()),
      LOOK('micrometer'),
      { spot: 'a', view: 'scale', hl: 'num', flat: 'the sleeve number', title: 'Read the sleeve number', text: () => 'The camera is on the sleeve now. The last number showing is a hundred thou (0.100″) each.' + now('vA') },
      { spot: 'b', view: 'scale', hl: 'line', flat: 'the last sleeve line', title: 'Count the sleeve lines', text: () => 'Each small line showing past that number adds 25 thou (0.025″).' + now('vB') },
      { spot: 'c', view: 'scale', hl: 'thimble', flat: 'the thimble mark on or just below the index line', title: 'Read the thimble', text: () => 'The thimble adds the thou, one thou (0.001″) per line. Follow the index line, the long line along the sleeve, across onto the thimble, and take the highest thimble mark that sits on it or below it. A mark above the index line hasn’t reached it yet, so it doesn’t count.' + now('vC') },
      { spot: 'vernSpan', flatKey: 'd', view: 'vernier', frame: ['d'], refit: true, hl: 'vernier', flat: 'the vernier line that lines up with a thimble line', title: 'Find the vernier line',
        text: () => 'Looking square on at the one vernier line that lines up, from its number on the sleeve to where it meets its thimble line at the thimble edge: the two run on as one straight line. That line’s number is the tenths, a tenth (0.0001″) each.' + now('vD') },
      { target: '#reading .bd', title: 'Add them up', text: () => 'Frame size + sleeve number + sleeve lines + thimble + vernier = the reading.' + now('vT', 'This one reads') },
      SHORT('mic'),
      PRACTICE
    ],
    depth: [
      INTRO('depth micrometer'),
      PART('section:has(#sampleSel) .dd, #sampleSel'),
      Object.assign({ spot: 'Ratchet stop', box: [280, 220], view: 'iso', arrow3d: true, drag: true, title: 'Run the rod down by hand',
        text: 'The part slides under the base and the base sits down on it by itself. Now watch the hand: press on the ratchet stop where the ring pulses, hold the button down, and circle round it the way the arrow goes, running the rod down until the ratchet clicks on the bottom.' }, offThenOn()),
      LOOK('micrometer'),
      { spot: 'nextNum', view: 'scale', flat: 'the first number showing below the thimble', title: 'Find the first number you can see', text: () => {
        const a = depA(), n = a == null ? null : a + 1;
        return 'On a depth mic the thimble slides down over the sleeve as the rod goes deeper, so part of the reading hides under it. Work from what you can see: look just below the thimble’s edge at the first number still showing'
          + (n == null ? '. The number just above it is under the thimble, so the hundred thou is one less than the number you see.'
            : (n === 10 ? ' (past “9” it’s the end of the inch).' : `, <b>“${n}”</b>.`) + ` The number just above it is under the thimble, so the hundred thou is one less: <b>${a}</b>, or ${a * 100} thou.`);
      } },
      { spot: 'openLines', view: 'scale', flat: 'the lines still showing between the thimble and that number', title: 'Count the lines you can see', text: () => {
        const b = depB();
        return 'Now count the small lines you can still see between the thimble’s edge and that number. Three lines fit in that gap, 25 thou (0.025″) each, so the thimble has passed 3 minus the ones you see.'
          + (b == null ? '' : ` Here you can see <b>${3 - b}</b>, so it has passed <b>${b}</b>: ${b * 25} thou.`);
      } },
      { spot: 'c', view: 'scale', hl: 'thimble', flat: 'the thimble line on the center line', title: 'Read the thimble', text: () => 'The thimble line on the center line adds the thou, one thou (0.001″) per line.' + now('vC') },
      { target: '#reading .bd', title: 'Add them up', text: () => 'Rod size + (first number you see − 1) hundred thou + (3 − lines you see) × 25 thou + thimble = the reading.' + now('vT', 'This one reads') },
      SHORT('depth'),
      PRACTICE
    ],
    height: u => [
      CHOOSE,
      INTRO('height gage'),
      PART('section:has(#partSel) .dd, #partSel'),
      Object.assign({ spot: 'Slider', box: [260, 240], view: 'iso', refit: true, dir: 'y', drag: true, title: 'Bring the scriber down by hand',
        text: 'The part slides under the scriber by itself. Now watch the hand: press on the slider where the ring pulses, hold the button down, and drag it down the beam along the arrow until the scriber rests on the part’s face.' }, offThenOn()),
      LOOK('height gage'),
      // the card sits on the other scale's side of the beam: on the inch side while millimeters are read, and on
      // the metric side while inches are, so it never covers the scale being read
      ...(u === 'mm' ? [
        { spot: 'mmNum', side: 'left', box: [150, 110], flat: 'the centimeter number', frame: ['mmNum', 'mvernZero'], title: 'Find the centimeter mark', text: () => {
          const v = parseFloat(val('mMain'));
          return 'Look at the metric scale on the beam, on the right. The big numbers are centimeters, 10 mm each. Find the last one at or below the vernier’s 0'
            + (isNaN(v) ? '.' : `: <b>${Math.floor(v/10)} cm</b>, which is ${Math.floor(v/10)*10} mm.`);
        } },
        { spot: 'mmLine', side: 'left', box: [150, 90], flat: 'the main-scale line at or below the vernier’s 0', frame: ['mmLine', 'mvernZero'], hl: 'mmain', title: 'Find the line at or below the zero', text: () => {
          const v = parseFloat(val('mMain'));
          return 'Now go up from that number to the last main-scale line at or below the vernier’s 0, or the one that meets it exactly. Each line is one millimeter.'
            + (isNaN(v) ? '' : ` Here it’s ${Math.round(v) % 10} line${Math.round(v) % 10 === 1 ? '' : 's'} past the ${Math.floor(v/10)}: <b>${Math.round(v)} mm</b>.`);
        } },
        { spot: 'mvernLine', side: 'left', box: [180, 90], flat: 'the vernier line that lines up', loupe: 'loupeMm', frame: ['mvernZero', 'mvernEnd', 'mvernLine'], hl: 'mvern', title: 'Now focus on the vernier scale', text: () => 'Look along the metric vernier and find the one line that lines up exactly with a main-scale line. Each vernier line is 0.02 mm, and its big numbers are tenths of a millimeter.' + nowMM('mVern') },
        { target: '#reading .rgroup ~ .rgroup', title: 'Add them up', text: () => 'Centimeters + millimeter lines + vernier (0.02 mm per line) = the reading in millimeters.' + nowMM('mTot', 'This one reads') }
      ] : [
        { spot: 'inchNum', side: 'right', box: [150, 110], flat: 'the inch number', frame: ['inchNum', 'vernZero'], title: 'Find the inch mark', text: () => {
          const v = parseFloat(val('iMain'));
          return 'Look at the inch scale on the beam, on the left. The big numbers are whole inches. Find the last one at or below the vernier’s 0'
            + (isNaN(v) ? '.' : `: <b>${Math.floor(v)}″</b>.`);
        } },
        { spot: 'mainLine', side: 'right', box: [150, 90], flat: 'the main-scale line at or below the vernier’s 0', frame: ['mainLine', 'vernZero'], hl: 'imain', title: 'Find the line at or below the zero', text: () => {
          const v = parseFloat(val('iMain')), n = parseInt(val('iMainH'), 10);
          return 'Now go up from that number to the last main-scale line at or below the vernier’s 0, or the one that meets it exactly. Each line is 50 thou (0.050″).'
            + (isNaN(v) || isNaN(n) ? '' : ` Here it’s ${n % 20} line${n % 20 === 1 ? '' : 's'} past the ${Math.floor(v)}: <b>${v.toFixed(3)}″</b>.`);
        } },
        { spot: 'vernLine', side: 'right', box: [180, 90], flat: 'the vernier line that lines up', loupe: 'loupeIn', frame: ['vernZero', 'vernEnd', 'vernLine'], hl: 'ivern', title: 'Now focus on the vernier scale', text: () => 'Look along the vernier and find the one line that lines up exactly with a main-scale line. Each vernier line is one thou (0.001″), so its number is how many thou to add.' + now('iVern') },
        { target: '#reading .rgroup', title: 'Add them up', text: () => 'Inch + main-scale lines + vernier (one thou per line) = the reading in inches.' + now('iTot', 'This one reads') }
      ]),
      SHORT('height'),
      PRACTICE
    ]
  };
  // the steps in use: the vernier caliper and height gage build theirs for the unit picked at the start
  // After each reading step comes the same mark on the flat view (the scales drawn out flat in the corner, the
  // minimap), lit up in the same color, so what was read on the tool and what the flat view shows are plainly
  // one thing. The first of them says what every part of the flat view is; a vernier step also gets the
  // magnifier (the close-up of the lines that line up) explained, where the tool has one.
  const MINI = {
    dial: 'The flat view in the corner is a minimap of the scales, drawn out flat so nothing curves away. The strip on top is the beam at the slider edge (inch numbers and hundred-thou lines); under it is the dial, needle and all.',
    vern: 'The flat view in the corner is a minimap of the scales, drawn out flat so nothing curves away. On top is the beam with the vernier plate under its edge, just as on the tool; the strip at the bottom is a magnifier on the lines round the vernier line that lines up.',
    mic: 'The flat view in the corner is a minimap of the sleeve and thimble, unrolled flat so nothing curves round out of sight. The sleeve is on the left, its numbers and lines along the index line (and the vernier lines up its left side); the thimble marks run down the right.',
    depth: 'The flat view in the corner is a minimap of the sleeve and thimble, unrolled flat so nothing curves round out of sight. The thimble is at the top: it covers the reading as the rod goes down. The sleeve numbers under it run toward the base.',
    height: 'The flat view on the right is a minimap of the scales, drawn out flat. The close-up at the top magnifies the vernier line that lines up (the inch row, then the metric row); below it, the beam’s inch scale (left) and metric scale (right) run up the middle with both verniers riding beside them.'
  };
  const LOUPES = {
    loupe: () => curUnit === 'mm' ? 'The strip along the bottom of the flat view magnifies the millimeter scale round the top vernier line that lines up: the vernier’s lines above the edge, the beam’s millimeter lines below. Only the vernier line counts, 0.05 mm per line: the lit one meets a beam line exactly, while the lines either side plainly miss.' + nowMM('vV')
      : 'The strip along the bottom of the flat view magnifies the lines round the one that lines up, ten times over: the beam’s lines above the edge, the vernier’s numbered lines below. Only the vernier number counts, one thou per line: the lit vernier line meets a beam line exactly, while the lines either side plainly miss.' + now('vV'),
    loupeIn: () => 'The close-up at the top of the flat view magnifies the inch vernier (the top row), centered on the vernier line that meets a main-scale line. It is lit and labeled with the thou it adds, so you can see it meet exactly while its neighbors miss.' + now('iVern'),
    loupeMm: () => 'The close-up at the top of the flat view magnifies the metric vernier in its lower row, centered on the vernier line that meets a main-scale line. It is lit and labeled with what it adds, so you can see it meet exactly while its neighbors miss.' + nowMM('mVern')
  };
  // a mark that sits just past an edge of the flat view (it only draws so much round the reading) is shown by a
  // strip along that edge, and the card says so
  let flatEdge = '';
  const edgeNote = () => flatEdge === 'note' ? ' Here the number itself is just off the edge of the flat view, so the flat view says where it is, in the lit note.'
    : flatEdge ? ` Here it sits just past the ${flatEdge} edge of the flat view, where the lit strip is; the scale carries on past it.` : '';
  const FLAT = (s, first) => ({ flatSpot: s.flatKey || s.spot, target: '#flat', hl: s.hl, flatStep: true, title: first ? 'Meet the flat view' : 'Now on the flat view',
    text: () => ((first ? MINI[tool] + ' ' : 'The flat view draws the same scales out flat, so nothing curves away. ')
      + (flatEdge === 'note' ? '' : `Here’s ${s.flat} again, in the lit window${s.hl ? ' and in the same color' : ''}.`) + edgeNote() + ' Use it to check what you read on the tool.').replace(/  +/g, ' ') });
  const LOUPE = s => ({ flatSpot: s.loupe, target: '#flat', hl: s.hl, flatStep: true, title: tool === 'height' ? 'The close-up' : 'The magnifier', text: () => LOUPES[s.loupe]() });
  const STEPS = [];
  let curUnit = 'in';
  const build = u => {
    curUnit = u;
    const t = TOURS[tool], list = typeof t === 'function' ? t(u) : t;
    let first = true;
    STEPS.splice(0, STEPS.length, ...list.flatMap(s => {
      if (!s.flat || !$('flat')) return [s];
      const out = [s, FLAT(s, first)]; first = false;
      if (s.loupe) out.push(LOUPE(s));
      return out;
    }));
  };
  build('in');
  const pressUnits = u => { const b = document.querySelector(`aside [data-units="${u}"]`); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); };

  /* ---------- the button, right beside Tutorial ---------- */
  const pair = document.createElement('span'); pair.className = 'gd-pair';
  tutBtn.parentNode.insertBefore(pair, tutBtn); pair.appendChild(tutBtn);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'guideBtn'; btn.className = tutBtn.className;
  btn.innerHTML = 'Show me <span class="gd-beta">beta</span>';
  btn.setAttribute('aria-label', 'Show me: a guided walkthrough of one measurement (experimental)');
  btn.dataset.tip = 'Show me (experimental)\nWalks you through one real measurement on the 3D tool, step by step.';
  pair.appendChild(btn);

  /* ---------- styles ---------- */
  const css = document.createElement('style');
  css.textContent = `
.gd-pair{display:inline-flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}
.gd-beta{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 5px;border-radius:999px;margin-left:3px;vertical-align:1px;background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--accent)}
.gd{position:fixed;inset:0;z-index:900;pointer-events:none}
.gd-hole{position:fixed;left:0;top:0;border-radius:10px;box-shadow:0 0 0 2px var(--accent),0 0 18px 2px color-mix(in srgb,var(--accent) 55%,transparent);pointer-events:none;will-change:transform}
.gd-hole.none{display:none}
.gd-dim{position:fixed;inset:0;pointer-events:auto;background:rgba(4,5,7,.74)}
.gd-svg{position:fixed;inset:0;width:100%;height:100%;overflow:visible}
.gd-svg path{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(0,0,0,.6))}
.gd-svg polygon{fill:var(--accent)}
.gd-drag{position:fixed;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.gd-drag .gd-glow{fill:none;stroke:var(--accent);stroke-opacity:.28;stroke-width:24;stroke-linecap:round;stroke-linejoin:round}
.gd-drag .gd-trail{fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 14;animation:gd-march .6s linear infinite;filter:drop-shadow(0 0 3px rgba(0,0,0,.9))}
.gd-drag .gd-done{fill:none;stroke:var(--accent);stroke-width:8;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 6px var(--accent))}
.gd-drag .gd-head{fill:var(--accent);stroke:#fff;stroke-width:2;stroke-linejoin:round;filter:drop-shadow(0 0 6px rgba(0,0,0,.8))}
.gd-drag .gd-grab{fill:color-mix(in srgb,var(--accent) 30%,transparent);stroke:#fff;stroke-width:2.5}
.gd-drag .gd-ring{fill:none;stroke:var(--accent);stroke-width:3}
@keyframes gd-march{to{stroke-dashoffset:-15}}
.gd-hand{position:fixed;left:0;top:0;width:44px;height:44px;transform-origin:12px 1px;font-size:40px;line-height:1;color:#fff;pointer-events:none;will-change:transform,opacity;filter:drop-shadow(0 2px 3px rgba(0,0,0,.85)) drop-shadow(0 0 1px #000)}
.gd-hand svg,.gd-hand i{width:40px;height:40px}
.gd-lbl{position:fixed;left:0;top:0;pointer-events:none;white-space:nowrap;will-change:transform;font-size:13.5px;font-weight:700;letter-spacing:.02em;color:#0b0c0e;background:var(--accent);padding:5px 10px 5px 8px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.55);display:flex;gap:6px;align-items:center}
.gd-track{position:absolute;pointer-events:none;visibility:hidden}
.gd-card{position:fixed;left:0;top:0;will-change:transform;width:min(330px,calc(100vw - 24px));pointer-events:auto;background:var(--panel,#16181b);color:var(--ink,#ececee);border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);border-radius:12px;padding:14px 16px 12px;box-shadow:0 14px 40px rgba(0,0,0,.55);font-size:13.5px;line-height:1.5}
.gd-card h4{margin:0 26px 6px 0;font-size:15px;font-weight:600}
.gd-card p{margin:0;color:var(--muted,#8a8f97)}
.gd-card p b{color:var(--ink,#ececee)}
.gd-choose{display:flex;gap:8px;margin-top:12px}
.gd-choose[hidden]{display:none}
.gd-card .gd-choose button{flex:1;padding:9px 10px;font-size:13px;font-weight:600}
.gd-do{margin-top:8px;font-size:12px;color:var(--accent);display:flex;gap:6px;align-items:center}
.gd-do[hidden]{display:none}
.gd-card .gd-max{display:flex;width:100%;margin-top:10px;padding:7px 10px;gap:7px;align-items:center;justify-content:center;font-weight:600}
.gd-card .gd-max[hidden]{display:none}
.gd-max .ic-shrink{display:none}
.gd-max.on .ic-grow{display:none}
.gd-max.on .ic-shrink{display:inline-block}
.gd-foot{display:flex;align-items:center;gap:6px;margin-top:12px}
.gd-count{flex:1;font-size:11.5px;color:var(--muted,#8a8f97);font-variant-numeric:tabular-nums}
.gd-card button{padding:5px 12px;font-size:12.5px;border-radius:7px}
.gd-x{position:absolute;top:8px;right:8px;width:26px;height:26px;padding:0!important;display:grid;place-items:center;border-radius:50%!important}
body.guiding .dd-list{z-index:950}
body.guiding .flat{transition:filter .25s,opacity .2s ease}
body.guiding .flat.gd-away{opacity:0;visibility:hidden;pointer-events:none;transition:filter .25s,opacity .2s ease,visibility 0s linear .2s}
@media (prefers-reduced-motion: reduce){ .gd-drag .gd-trail{animation:none} body.guiding .flat,body.guiding .flat.gd-away{transition:none} }`;
  document.head.appendChild(css);

  /* ---------- the overlay ---------- */
  let root = null, hole, dim, svg, card, stepI = 0, timer = 0, waitDone = false, clickOff = null, saved = null, lastText = '';
  // the hand that shows a drag: its path, the moving hand, and its label (see showDrag)
  let dragSvg = null, dragEls = null, hand = null, dragLbl = null, pressing = false, lastDragKey = '', lastLbl = '';
  let lastR = null, lastSide = -1, lastCard = null, lastSvg = '', arrowPath = null, arrowHead = null, cardW = 0, cardH = 0;
  // what is on screen now, easing toward where things belong: the window (x, y, w, h) and the card (x, y)
  let shown = null, lastPlaceT = 0;
  // every move to a step gets a new number; an automatic "move on" only runs if nothing has moved since
  let navId = 0;
  // the card's size is measured when its words change, not on every frame
  const measureCard = () => { cardW = card.offsetWidth; cardH = card.offsetHeight; };
  // write a style only when it changes, so a still frame costs nothing
  const put = (el, prop, v) => { const k = '_' + prop; if (el[k] !== v){ el[k] = v; el.style[prop] = v; } };
  const mk = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; (parent || root).appendChild(e); return e; };
  const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const fn = (v, s) => typeof v === 'function' ? v(s) : v;
  function targetOf(s){
    const sel = s.target || (s.spot ? '#view' : '');
    if (!sel) return null;
    for (const q of sel.split(',').map(x => x.trim())){
      const e = document.querySelector(q);
      if (visible(e)) return e;
    }
    return null;
  }
  // the box the window opens on: around the 3D spot while it is on screen, else the step's element
  // A mark on the flat view is found by a tracker: an invisible box placed inside the flat view itself, over the
  // mark, in the canvas's own layout units. Whatever the flat view does (grow to full height, shrink back, glide
  // between the two), the tracker goes with it, and its box on screen is exactly where the mark is. A mark
  // past an edge (the flat view only draws so much round the reading) gets a strip along that edge instead.
  let tracker = null;
  function flatBox(name){
    flatEdge = '';
    const raw = window.__guideFlatRaw && window.__guideFlatRaw(name), cv = raw && $(raw.cv);
    if (!raw || !cv || !cv.clientWidth || !cv.getClientRects().length) return null;
    const host = cv.offsetParent; if (!host) return null;
    if (!tracker){ tracker = document.createElement('div'); tracker.className = 'gd-track'; tracker.setAttribute('aria-hidden', 'true'); }
    if (tracker.parentNode !== host) host.appendChild(tracker);
    if (raw.note) flatEdge = 'note';
    const W = raw.w, H = raw.h, m = 2, band = 26;
    let [x0, y0, x1, y1] = raw.box;
    if (y0 >= H - 6){ flatEdge = 'bottom'; y0 = H - band; y1 = H - m; } else if (y1 <= 6){ flatEdge = 'top'; y0 = m; y1 = band; }
    if (x0 >= W - 6){ flatEdge = 'right'; x0 = W - band; x1 = W - m; } else if (x1 <= 6){ flatEdge = 'left'; x0 = m; x1 = band; }
    x0 = Math.max(m, x0); y0 = Math.max(m, y0); x1 = Math.min(W - m, x1); y1 = Math.min(H - m, y1);
    if (x1 - x0 < 14){ const c = (x0 + x1)/2; x0 = Math.max(m, c - 7); x1 = Math.min(W - m, c + 7); }
    if (y1 - y0 < 14){ const c = (y0 + y1)/2; y0 = Math.max(m, c - 7); y1 = Math.min(H - m, c + 7); }
    const kx = cv.clientWidth/W, ky = cv.clientHeight/H, ox = cv.offsetLeft + cv.clientLeft, oy = cv.offsetTop + cv.clientTop;
    const px = v => (Math.round(v*10)/10) + 'px';
    put(tracker, 'left', px(ox + x0*kx)); put(tracker, 'top', px(oy + y0*ky));
    put(tracker, 'width', px((x1 - x0)*kx)); put(tracker, 'height', px((y1 - y0)*ky));
    const b = tracker.getBoundingClientRect();
    return b.width > 2 && b.height > 2 ? b : null;
  }
  function boxOf(s){
    if (s.flatSpot && window.__guideFlatRaw) return flatBox(s.flatSpot) || (targetOf(s) ? targetOf(s).getBoundingClientRect() : null);
    // a mark on the flat view: the box the tool gives, kept inside the flat view's canvas
    if (s.flatSpot && window.__guideFlatSpot){
      const b = window.__guideFlatSpot(s.flatSpot), cv = $('flatCv'), cr = cv && cv.getBoundingClientRect();
      if (b && cr && cr.width > 2){
        const l = Math.max(cr.left + 2, b.left - 4), t = Math.max(cr.top + 2, b.top - 4);
        const r = Math.min(cr.right - 2, b.right + 4), bt = Math.min(cr.bottom - 2, b.bottom + 4);
        if (r - l > 8 && bt - t > 8) return { left: l, top: t, right: r, bottom: bt };
      }
    }
    if (s.spot && window.__guideSpot){
      const p = window.__guideSpot(s.spot), v = $('view'), vr = v && v.getBoundingClientRect();
      if (p && vr && p.x > vr.left && p.x < vr.right && p.y > vr.top && p.y < vr.bottom){
        const [w, h] = p.w ? [p.w, p.h] : s.box || [250, 170];   // a spot can say how big it is on screen
        const l = Math.max(vr.left + 4, p.x - w / 2), t = Math.max(vr.top + 4, p.y - h / 2);
        return { left: l, top: t, right: Math.min(vr.right - 4, l + w), bottom: Math.min(vr.bottom - 4, t + h) };
      }
    }
    const t = targetOf(s);
    return t ? t.getBoundingClientRect() : null;
  }
  // make sure what a step points at is showing: the side panel, the reading panel, the flat view
  function reveal(e){
    if (!e) return;
    const b = document.body;
    if (e.closest('aside') && b.classList.contains('side-off') && $('sideBtn')) $('sideBtn').click();
    if (e.closest('#reading') && b.classList.contains('panel-off') && $('panelBtn')) $('panelBtn').click();
    if (e.closest('aside')) e.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  // the flat view floats over the 3D view: while the lit window round a spot on the tool would show it on top
  // of what the step points at, it fades out of the way, and comes back once the window moves off it or the walkthrough ends. Its box
  // is still measured while it is faded (display is untouched), so it can't flicker in and out.
  const flatEl = $('flat');
  let flatAway = false, flatOpened = false, flatMax0 = false;
  const flatIsMax = () => !!$('flatMaxBtn') && $('flatMaxBtn').getAttribute('aria-pressed') === 'true';
  // a flat-view step makes sure the flat view is there to see: opened if it was shut, grown if the window is too
  // small for it to show its scales in the corner, and scrolled to on a phone (where it sits under the 3D view)
  function showFlat(){
    const fl = $('flat'); if (!fl) return;
    if (fl.classList.contains('closed') && $('flatBtn')){ $('flatBtn').click(); flatOpened = true; }
    if (['ov-hide', 'ov-min', 'min'].some(c => fl.classList.contains(c)) && $('flatMaxBtn') && !flatIsMax()) $('flatMaxBtn').click();
    if (fl.classList.contains('docked')) fl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // the card's button to grow the flat view to full height, or shrink it back, whichever it isn't now
  function syncMax(){
    const b = card && card.querySelector('.gd-max'), s = STEPS[stepI], fl = $('flat');
    if (!b) return;
    const show = !!(s && s.flatStep && $('flatMaxBtn') && fl && !fl.classList.contains('docked')), on = flatIsMax();
    const was = [b.hidden, b.classList.contains('on')];
    b.hidden = !show; b.classList.toggle('on', on);
    b.querySelector('span').textContent = on ? 'Shrink the minimap back' : 'Expand the minimap';
    b.setAttribute('aria-pressed', String(on));
    if (was[0] !== b.hidden || was[1] !== on) measureCard();
  }
  function dodgeFlat(r){
    if (!flatEl) return;
    let away = false;
    if (r && root && flatEl.getClientRects().length){
      const f = flatEl.getBoundingClientRect();
      away = f.left < r.x + r.w && r.x < f.right && f.top < r.y + r.h && r.y < f.bottom;
    }
    if (away !== flatAway){ flatAway = away; flatEl.classList.toggle('gd-away', away); }
  }
  // what the card has to stay off: the lit window, and on a step that frames several marks on the tool (the
  // number, the vernier's 0 and so on), every one of them that is in sight, with a little room round each
  function keepClear(s, r){
    let l = r.x, t = r.y, rt = r.x + r.w, bt = r.y + r.h;
    const vr = s.spot && s.frame && window.__guideSpot && $('view') && $('view').getBoundingClientRect();
    if (vr) for (const n of s.frame){
      const p = window.__guideSpot(n), m = 28;
      if (!p || p.x < vr.left || p.x > vr.right || p.y < vr.top || p.y > vr.bottom) continue;
      l = Math.min(l, p.x - m); t = Math.min(t, p.y - m); rt = Math.max(rt, p.x + m); bt = Math.max(bt, p.y + m);
    }
    return { x: l, y: t, w: rt - l, h: bt - t };
  }
  function setHl(name, on){
    const c = document.querySelector(`input[data-hl="${name}"]`);
    if (c && c.checked !== on){ c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  function start(){
    if (root) return;
    // leave practice and examination first: both hide the answers the walkthrough points at
    const b = document.body;
    if (b.classList.contains('exam') && $('exitExam')) $('exitExam').click();
    if (b.classList.contains('practice') && $('practiceBtn')) $('practiceBtn').click();
    saved = [...document.querySelectorAll('input[data-hl]')].map(c => [c, c.checked]);
    flatMax0 = flatIsMax();
    build('in');
    if (!STEPS[0].choose) pressUnits('in');
    STEPS.forEach(x => { x.done = false; });
    shown = null; lastPlaceT = 0;
    // clear the old part a moment after the overlay has faded in, so the two never share a frame
    setTimeout(() => {
      if (!root || !partList || STEPS[stepI].part && STEPS[stepI].done) return;
      if ([...partList.options].some(o => o.value === 'none') && partList.value !== 'none'){
        partList.value = 'none'; partList.dispatchEvent(new Event('change', { bubbles: true }));
        partPicked = false;
      }
    }, 320);
    root = document.createElement('div'); root.className = 'gd';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Show me walkthrough');
    dim = mk('div', 'gd-dim');
    hole = mk('div', 'gd-hole');
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'gd-svg'); svg.setAttribute('aria-hidden', 'true'); root.appendChild(svg);
    svg.innerHTML = '<path/><polygon/>'; arrowPath = svg.firstChild; arrowHead = svg.lastChild;
    // the drag hint: its path (a soft glow, a white trail marching the way to go, the stretch already covered, an
    // arrowhead), a ring pulsing where to press, the hand that does it, and a label saying what to do
    dragSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); dragSvg.setAttribute('class', 'gd-drag'); dragSvg.setAttribute('aria-hidden', 'true'); root.appendChild(dragSvg);
    dragSvg.innerHTML = '<path class="gd-glow"/><path class="gd-trail"/><path class="gd-done"/><polygon class="gd-head"/><circle class="gd-ring"/><circle class="gd-grab"/>';
    dragEls = { glow: dragSvg.children[0], trail: dragSvg.children[1], done: dragSvg.children[2], head: dragSvg.children[3], ring: dragSvg.children[4], grab: dragSvg.children[5] };
    hand = mk('div', 'gd-hand'); hand.setAttribute('aria-hidden', 'true'); hand.innerHTML = '<i class="fa-solid fa-hand-pointer"></i>';
    dragLbl = mk('div', 'gd-lbl'); dragLbl.setAttribute('aria-hidden', 'true');
    lastDragKey = ''; lastLbl = ''; pressing = false;
    card = mk('div', 'gd-card');
    card.innerHTML = `<button class="gd-x" type="button" aria-label="Exit the walkthrough" data-tip="Exit">✕</button><h4></h4><p aria-live="polite"></p>
      <div class="gd-choose" hidden></div>
      <div class="gd-do" hidden><i class="fa-solid fa-hand-pointer"></i><span></span></div>
      <button type="button" class="gd-max" hidden><i class="fa-solid fa-expand ic-grow"></i><i class="fa-solid fa-compress ic-shrink"></i><span>Expand the minimap</span></button>
      <div class="gd-foot"><span class="gd-count"></span><button type="button" class="gd-back">Back</button><button type="button" class="gd-next primary">Next</button></div>`;
    card.querySelector('.gd-x').addEventListener('click', stop);
    // picking a unit sets the tool to it, builds the steps for it, and moves on
    card.querySelector('.gd-choose').addEventListener('click', e => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      pressUnits(b.dataset.u); build(b.dataset.u);
      STEPS.forEach(x => { x.done = false; });
      go(1);
    });
    card.querySelector('.gd-back').addEventListener('click', () => go(stepI - 1));
    // "Expand the minimap" / "Shrink the minimap back": the flat view grows to full height or goes back to its
    // corner; whichever size it had before the walkthrough comes back when it ends
    card.querySelector('.gd-max').addEventListener('click', () => {
      if ($('flatMaxBtn')) $('flatMaxBtn').click();
      syncMax();
    });
    card.querySelector('.gd-next').addEventListener('click', () => stepI >= STEPS.length - 1 ? stop() : advance());
    document.body.appendChild(root);
    b.classList.add('guiding');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', onPress, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onRelease, true);
    window.addEventListener('pointercancel', onRelease, true);
    timer = setInterval(tick, 90);
    // every frame: the window and card ease toward where they belong (and follow the 3D spot as the camera moves)
    const follow = () => { if (!root) return; place(); requestAnimationFrame(follow); };
    requestAnimationFrame(follow);
    if (root.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    go(0);
  }
  function stop(){
    if (!root) return;
    clearInterval(timer); timer = 0;
    if (clickOff) { clickOff(); clickOff = null; }
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointerdown', onPress, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('pointercancel', onRelease, true);
    const gone = root; root = null; navId++;
    dodgeFlat(null);
    const fl = $('flat');
    if ($('flatMaxBtn') && flatIsMax() !== flatMax0) $('flatMaxBtn').click();   // back to the size it had
    if (flatOpened && fl && !fl.classList.contains('closed') && $('flatBtn')) $('flatBtn').click();
    flatOpened = false;
    if (tracker){ tracker.remove(); tracker = null; }
    // and the camera goes back to the plain iso view
    const iso = document.querySelector('#view [data-view="iso"]');
    if (iso) iso.click();
    if (gone.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      gone.style.pointerEvents = 'none';
      gone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' }).onfinish = () => gone.remove();
      setTimeout(() => gone.remove(), 400);
    } else gone.remove();
    document.body.classList.remove('guiding');
    if (window.__guideArrow) window.__guideArrow(false);
    // put the highlight colors back the way they were
    if (saved) saved.forEach(([c, on]) => { if (c.checked !== on){ c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); } });
    saved = null;
    btn.focus({ preventScroll: true });
  }
  function onResize(){ measureCard(); place(); }
  // while a button is held (the drag being done), the hand steps aside so it isn't in the way
  function onPress(e){
    if (card && card.contains(e.target)) return;
    pressing = { x: e.clientX, y: e.clientY, far: false, view: !!(e.target.closest && e.target.closest('#view canvas')) };
  }
  // a drag across the 3D view counts for "Look around": the first press arms it, a drag of 40 px lets it go on
  function onMove(e){ if (pressing && !pressing.far && Math.hypot(e.clientX - pressing.x, e.clientY - pressing.y) > 40) pressing.far = true; }
  function onRelease(){ if (pressing && pressing.view && pressing.far) looked = 2; pressing = false; }
  function onKey(e){
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); stop(); }
  }

  function go(i){
    if (i < 0 || i >= STEPS.length) return;
    // a step whose element isn't on this screen is passed over, in whichever direction we were going
    const dirn = i >= stepI ? 1 : -1;
    // (a flat-view step is never passed over: it brings the flat view out itself)
    const skip = x => ((x.target || x.spot) && !x.flatStep && !targetOf(x)) || (x.part && x.done);   // a part is already picked: never back to that step
    while (skip(STEPS[i]) && i + dirn >= 0 && i + dirn < STEPS.length) i += dirn;
    if (STEPS[i].part && STEPS[i].done) return;   // nowhere else to go
    stepI = i; navId++;
    const s = STEPS[i];
    if (clickOff) { clickOff(); clickOff = null; }
    if (card.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      card.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
    waitDone = false; lastText = ''; lastR = null; lastSide = -1; lastCard = null;
    if (s.enter) s.enter(s);
    if (window.__guideArrow) window.__guideArrow(!!s.arrow3d);   // the 3D arrow around the ratchet, where a step asks for it
    // only this step's highlight is lit, and the camera flies to where the step looks
    if (saved) saved.forEach(([c]) => setHl(c.dataset.hl, c.dataset.hl === s.hl));
    const vb = s.view && document.querySelector(`#view [data-view="${s.view}"]`);
    if (!(s.frame && window.__guideFrame && window.__guideFrame(s.frame)) && vb) vb.click();
    const t = targetOf(s);
    if (!s.spot) reveal(t);
    // a flat-view step brings the flat view out (opened, grown or scrolled to), and it goes back when the walkthrough ends
    if (s.flatStep) showFlat();
    card.querySelector('h4').textContent = s.title;
    card.querySelector('.gd-count').textContent = `Step ${i + 1} of ${STEPS.length}`;
    card.querySelector('.gd-back').disabled = i === 0;
    const next = card.querySelector('.gd-next');
    next.textContent = i === STEPS.length - 1 ? 'Finish' : s.next || (s.waitClick || s.waitFor ? 'Skip' : 'Next');
    next.hidden = !!s.choose;
    const ch = card.querySelector('.gd-choose');
    ch.hidden = !s.choose;
    ch.innerHTML = s.choose ? s.choose.map(([u, label]) => `<button type="button" data-u="${u}">${label}</button>`).join('') : '';
    // on a flat-view step, a button to expand the flat view, or shrink it back once it is expanded
    syncMax();
    const doEl = card.querySelector('.gd-do');
    doEl.hidden = !(s.waitClick || s.waitFor || s.drag);
    doEl.querySelector('span').textContent = s.drag === 'look' ? 'Follow the hand: press on empty space, hold, and drag.'
      : s.drag ? 'Follow the hand: press where the ring pulses, hold, and ' + (s.arrow3d ? 'circle round the way the arrow goes.' : 'drag along the arrow.')
      : 'Give it a try!';
    // steps that wait for a click move on by themselves a moment after it (long enough to watch it happen)
    if (s.waitClick && t){
      const onClick = e => {
        if (s.clickIn && !e.target.closest(s.clickIn)) return;
        if (clickOff) { clickOff(); clickOff = null; }
        doEl.querySelector('span').textContent = 'Nice! Watch it happen…';
        const id = navId; setTimeout(() => { if (root && navId === id) advance(); }, s.waitClick);
      };
      t.addEventListener('click', onClick, true);
      clickOff = () => t.removeEventListener('click', onClick, true);
    }
    measureCard();
    tick();
    setTimeout(() => { try { (s.choose ? ch.querySelector('button') : next).focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  // a part is picked: the tool puts it in place by itself (the person brings the tool to it by hand), and on we go
  function partChosen(){
    STEPS[stepI].done = true; waitDone = true;
    if (window.__guidePlacePart) setTimeout(() => { try { window.__guidePlacePart(); } catch (e) {} }, 150);
    advance();
  }
  // an automatic "on to the next step": always forward, never back to a step that is done
  function advance(){
    let j = stepI + 1;
    while (j < STEPS.length - 1 && STEPS[j].part && STEPS[j].done) j++;
    if (j > stepI && j < STEPS.length) go(j);
  }
  function tick(){
    if (!root) return;
    const s = STEPS[stepI];
    const text = fn(s.text, s);
    if (text !== lastText){ card.querySelector('p').innerHTML = text; lastText = text; measureCard(); }
    syncMax();
    if (s.refit && window.__guideRefit) window.__guideRefit();
    if (s.waitFor && !waitDone && s.waitFor(s)){
      waitDone = true; s.done = true;
      card.querySelector('.gd-do span').textContent = 'Nice! On to the next step…';
      const id = navId; setTimeout(() => { if (root && navId === id) advance(); }, 900);
    }
    place();
  }

  // the bright window, the four click-catchers around it, the card beside it and the arrow between them
  // the bright window, the dim panels and click-catchers round it, the card beside it and the arrow between
  // them. All of it moves by transform to exact positions, every frame the 3D spot moves, so it glides with
  // the camera instead of stepping after it, and never makes the page repaint.
  // a rounded rectangle as a path, for cutting the window out of the dim
  const roundRect = (x, y, w, h, rr) => { const f = v => v.toFixed(1), a = f(rr), x2 = x + w, y2 = y + h;
    return `M${f(x + rr)} ${f(y)}H${f(x2 - rr)}A${a} ${a} 0 0 1 ${f(x2)} ${f(y + rr)}V${f(y2 - rr)}A${a} ${a} 0 0 1 ${f(x2 - rr)} ${f(y2)}H${f(x + rr)}A${a} ${a} 0 0 1 ${f(x)} ${f(y2 - rr)}V${f(y + rr)}A${a} ${a} 0 0 1 ${f(x + rr)} ${f(y)}Z`; };

  function place(){
    if (!root) return;
    const s = STEPS[stepI], W = innerWidth, H = innerHeight, pad = s.spot || s.flatSpot ? 0 : 8;
    const b = boxOf(s);
    let r = null;
    if (b){
      // an open dropdown list belongs to the window too, so it can be clicked
      const t = s.spot ? null : targetOf(s), list = t && t.querySelector && t.querySelector('.dd.open .dd-list');
      const lb = list ? list.getBoundingClientRect() : null;
      const x0 = Math.min(b.left, lb ? lb.left : Infinity), y0 = Math.min(b.top, lb ? lb.top : Infinity);
      const x1 = Math.max(b.right, lb ? lb.right : -Infinity), y1 = Math.max(b.bottom, lb ? lb.bottom : -Infinity);
      r = { x: Math.max(4, x0 - pad), y: Math.max(4, y0 - pad) };
      r.w = Math.min(W - 4, x1 + pad) - r.x; r.h = Math.min(H - 4, y1 + pad) - r.y;
      if (r.w < 4 || r.h < 4) r = null;
    }
    // a drag to make by hand: the lit window takes in the whole of its path, so it can all be seen and done
    const dg = dragPath(s, r);
    if (dg && r && !dg.look){
      const xs = dg.pts.map(p => p.x), ys = dg.pts.map(p => p.y), m = 30;
      const x0 = Math.max(4, Math.min(r.x, Math.min(...xs) - m)), y0 = Math.max(4, Math.min(r.y, Math.min(...ys) - m));
      const x1 = Math.min(W - 4, Math.max(r.x + r.w, Math.max(...xs) + m)), y1 = Math.min(H - 4, Math.max(r.y + r.h, Math.max(...ys) + m));
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    lastR = r;
    dodgeFlat(s.spot ? r : null);   // only a spot on the 3D tool can be covered; a whole-view step keeps it showing
    const px = v => (Math.round(v * 10) / 10) + 'px', tr = (x, y) => `translate(${px(x)},${px(y)})`;
    // ease toward the target: quick enough to follow the camera, soft enough that a new step glides over
    const now = performance.now(), dt = lastPlaceT ? Math.min(0.1, (now - lastPlaceT) / 1000) : 1; lastPlaceT = now;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, k = reduce ? 1 : 1 - Math.exp(-dt * 11);
    const want = r || { x: W / 2, y: H / 2, w: 0, h: 0 };
    if (!shown) shown = { x: want.x, y: want.y, w: want.w, h: want.h, cx: null, cy: null };
    for (const key of ['x', 'y', 'w', 'h']){ const dv = want[key] - shown[key]; shown[key] = Math.abs(dv) < 0.25 ? want[key] : shown[key] + dv * k; }
    const hr = { x: shown.x, y: shown.y, w: shown.w, h: shown.h };
    const open = hr.w >= 4 && hr.h >= 4;
    hole.classList.toggle('none', !open);
    if (open){ put(hole, 'width', px(hr.w)); put(hole, 'height', px(hr.h)); put(hole, 'transform', tr(hr.x, hr.y)); }
    // the dim: one sheet over the whole page with the window cut out of it, its corners rounded like the ring,
    // so there are no seams anywhere; the cut-out also lets clicks through to what is inside it
    const cut = open ? `path(evenodd, "M0 0H${W}V${H}H0Z ${roundRect(hr.x, hr.y, hr.w, hr.h, Math.min(10, hr.w / 2, hr.h / 2))}")` : 'none';
    put(dim, 'clipPath', cut); put(dim, 'webkitClipPath', cut);
    // the card never covers what the step shows: it goes on a side of the window (and of every mark the step
    // frames on the tool) that has room, the step's own side first where it asks for one, and never off screen
    if (!cardW) measureCard();
    const cw = cardW, ch = cardH, g = 46;   // g: room for the arrow between them
    let cx, cy;
    if (!r){ cx = (W - cw) / 2; cy = (H - ch) / 2; lastSide = -1; }
    else {
      const A = keepClear(s, r);
      const at = (side, gap) => side === 'right' ? { side, x: A.x + A.w + gap, y: r.y + r.h / 2 - ch / 2, room: W - (A.x + A.w) - gap - cw - 12 }
        : side === 'left' ? { side, x: A.x - gap - cw, y: r.y + r.h / 2 - ch / 2, room: A.x - gap - cw - 12 }
        : side === 'below' ? { side, x: r.x + r.w / 2 - cw / 2, y: A.y + A.h + gap, room: H - (A.y + A.h) - gap - ch - 12 }
        : { side, x: r.x + r.w / 2 - cw / 2, y: A.y - gap - ch, room: A.y - gap - ch - 12 };
      const order = [fn(s.side, s), 'right', 'left', 'below', 'above'].filter((x, i, a) => x && a.indexOf(x) === i);
      const opts = order.map(x => at(x, g));
      // it keeps its side while that side still has room, instead of hopping as the window moves
      const kept = opts.find(o => o.side === lastSide && o.room >= 0);
      let fit = kept || opts.find(o => o.room >= 0);
      if (!fit){
        // no side has room for the card and its arrow: the place that covers least of what is shown, with only a
        // small gap (the window is big enough to need no arrow then), else a corner of the page
        const cands = order.map(x => at(x, 12)).concat([[12, 12], [W - cw - 12, 12], [12, H - ch - 12], [W - cw - 12, H - ch - 12]].map(([x, y]) => ({ side: 'corner', x, y })));
        const cover = o => {
          const x = Math.max(12, Math.min(W - cw - 12, o.x)), y = Math.max(12, Math.min(H - ch - 12, o.y));
          const hit = q => Math.max(0, Math.min(x + cw, q.x + q.w) - Math.max(x, q.x)) * Math.max(0, Math.min(y + ch, q.y + q.h) - Math.max(y, q.y));
          return hit(r) * 4 + hit(A) + Math.hypot(x + cw / 2 - (r.x + r.w / 2), y + ch / 2 - (r.y + r.h / 2)) * 0.01;
        };
        fit = cands.reduce((a, o) => cover(o) < cover(a) ? o : a);
      }
      lastSide = fit.side;
      cx = fit.x; cy = fit.y;
    }
    cx = Math.max(12, Math.min(W - cw - 12, cx)); cy = Math.max(12, Math.min(H - ch - 12, cy));
    // the card eases over to its new place too
    if (shown.cx == null){ shown.cx = cx; shown.cy = cy; }
    else { const dx = cx - shown.cx, dy = cy - shown.cy; shown.cx = Math.abs(dx) < 0.25 ? cx : shown.cx + dx * k; shown.cy = Math.abs(dy) < 0.25 ? cy : shown.cy + dy * k; }
    cx = shown.cx; cy = shown.cy;
    lastCard = { x: cx, y: cy };
    put(card, 'transform', tr(cx, cy));
    // the arrow runs from the card's nearest edge to the window's nearest edge
    let d = '', pts = '';
    r = hr.w >= 4 && hr.h >= 4 ? hr : null;
    if (r){
      const c = { x: cx, y: cy, w: cw, h: ch };
      const overlap = c.x < r.x + r.w && r.x < c.x + c.w && c.y < r.y + r.h && r.y < c.y + c.h;
      if (!overlap){
        const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));
        const tc = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const p0 = { x: clampTo(tc.x, c.x, c.x + c.w), y: clampTo(tc.y, c.y, c.y + c.h) };
        const p1 = { x: clampTo(p0.x, r.x, r.x + r.w), y: clampTo(p0.y, r.y, r.y + r.h) };
        const dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy);
        if (L > 14){
          const ux = dx / L, uy = dy / L, end = { x: p1.x - ux * 6, y: p1.y - uy * 6 };
          const bend = Math.min(40, L * 0.25), mx = (p0.x + end.x) / 2 - uy * bend, my = (p0.y + end.y) / 2 + ux * bend;
          // the head points along the curve's last stretch
          const hx = end.x - mx, hy = end.y - my, hl = Math.hypot(hx, hy) || 1, ax = hx / hl, ay = hy / hl;
          const f = v => v.toFixed(1);
          d = `M${f(p0.x)},${f(p0.y)} Q${f(mx)},${f(my)} ${f(end.x - ax * 8)},${f(end.y - ay * 8)}`;
          pts = `${f(end.x)},${f(end.y)} ${f(end.x - ax * 13 - ay * 7)},${f(end.y - ay * 13 + ax * 7)} ${f(end.x - ax * 13 + ay * 7)},${f(end.y - ay * 13 - ax * 7)}`;
        }
      }
    }
    if (d + pts !== lastSvg){
      lastSvg = d + pts;
      arrowPath.setAttribute('d', d || 'M0,0'); arrowHead.setAttribute('points', pts || '0,0');
      put(svg, 'display', d ? '' : 'none');
    }
    showDrag(dg, now);
  }

  /* ---------- the hand that shows a drag ---------- */
  // The drag the step asks for, in page coordinates: from the tool (the thumb wheel's run to the part, a turn round
  // the ratchet, the slider down the beam), or for "Look around" a sweep across the middle of the view. Without
  // one from the tool it falls back to the way the step says, from the middle of the lit window.
  function dragPath(s, r){
    if (!s.drag || waitDone) return null;
    if (s.drag === 'look'){
      const vr = $('view') && $('view').getBoundingClientRect(); if (!vr || vr.width < 80) return null;
      const cx = vr.left + vr.width*0.5, cy = vr.top + vr.height*0.8, w = Math.min(280, vr.width*0.32), pts = [];   // low in the view, where it's usually empty
      for (let i = 0; i <= 24; i++){ const u = i/24; pts.push({ x: cx - w/2 + u*w, y: cy - Math.sin(u*Math.PI)*w*0.16 }); }
      return { pts, look: true };
    }
    const d = window.__guideDrag && window.__guideDrag();
    let pts = d && d.pts && d.pts.length > 1 ? d.pts.slice() : null;
    if (!pts){
      const dir = fn(s.dir, s); if (!dir || !r) return null;
      const c = { x: r.x + r.w/2, y: r.y + r.h/2 }, v = { left: [-1, 0], right: [1, 0], x: [1, 0], y: [0, 1] }[dir] || [1, 0];
      return { pts: [c, { x: c.x + v[0]*150, y: c.y + v[1]*150 }] };
    }
    if (d.turn){
      // a turn too small to follow is drawn bigger round the same middle: press on the knob, then circle out round it
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const cx = (x0 + x1)/2, cy = (y0 + y1)/2, size = Math.max(x1 - x0, y1 - y0);
      if (size < 120){ const k = 120/Math.max(size, 1); pts = [pts[0], ...pts.map(p => ({ x: cx + (p.x - cx)*k, y: cy + (p.y - cy)*k }))]; }
      return { pts, turn: true };
    }
    // a straight drag that reads at a glance: never shorter than 170 px, never longer than 340
    // (the tool may give a longer stretch than the move, just to aim by: len is the share of it the move takes)
    const a = pts[0], b = pts[pts.length - 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 0.5) return null;
    const want = Math.max(170, Math.min(340, L*(d.len == null ? 1 : d.len)));
    return { pts: [a, { x: a.x + dx/L*want, y: a.y + dy/L*want }] };
  }
  // The hint, drawn over the dim so it always shows: the path with a trail marching the way to go and an arrowhead
  // at the end, a ring pulsing where to press, and a hand that presses there, carries the drag along the path
  // (the stretch it has covered lighting up behind it), lets go and starts again. While a button is held down
  // the hand steps aside and the path fades back, so it never gets in the way of the drag itself.
  function showDrag(dg, t){
    const on = !!dg && !pressing;
    put(dragSvg, 'display', dg ? '' : 'none'); put(hand, 'display', on ? '' : 'none'); put(dragLbl, 'display', on ? '' : 'none');
    if (!dg) { lastDragKey = ''; return; }
    put(dragSvg, 'opacity', pressing ? '0.3' : '1');
    const pts = dg.pts, f = v => v.toFixed(1), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1] || 1;
    const at = len => {
      let i = 1; while (i < pts.length - 1 && cum[i] < len) i++;
      const a = pts[i - 1], b = pts[i], seg = (cum[i] - cum[i - 1]) || 1, k = Math.max(0, Math.min(1, (len - cum[i - 1])/seg));
      return { x: a.x + (b.x - a.x)*k, y: a.y + (b.y - a.y)*k, ax: (b.x - a.x)/seg, ay: (b.y - a.y)/seg };
    };
    const d = 'M' + pts.map(p => f(p.x) + ',' + f(p.y)).join('L');
    if (d !== lastDragKey){
      lastDragKey = d;
      const E = dragEls;
      E.glow.setAttribute('d', d); E.trail.setAttribute('d', d); E.done.setAttribute('d', d);
      // the arrowhead sits on the end, along the last stretch; the press ring on the start
      const e = pts[pts.length - 1], q = at(Math.max(0, total - 12)), ux = q.ax, uy = q.ay, L = Math.hypot(ux, uy) || 1, ax = ux/L, ay = uy/L;
      E.head.setAttribute('points', `${f(e.x + ax*14)},${f(e.y + ay*14)} ${f(e.x - ax*14 - ay*15)},${f(e.y - ay*14 + ax*15)} ${f(e.x - ax*14 + ay*15)},${f(e.y - ay*14 - ax*15)}`);
      E.grab.setAttribute('cx', f(pts[0].x)); E.grab.setAttribute('cy', f(pts[0].y)); E.grab.setAttribute('r', '11');
      E.ring.setAttribute('cx', f(pts[0].x)); E.ring.setAttribute('cy', f(pts[0].y));
    }
    // the ring keeps pulsing out from where to press
    const rp = (t % 1300)/1300;
    put(dragEls.ring, 'opacity', (1 - rp).toFixed(2)); dragEls.ring.setAttribute('r', f(12 + rp*30));
    // the loop: appear and press (0–16%), carry the drag along (16–80%), let go (80–88%), fade (90–100%)
    const period = dg.turn ? 3000 : dg.look ? 2600 : 2400, u = (t % period)/period;
    const ease = x => x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2)/2;
    const tr = u < 0.16 ? 0 : u > 0.8 ? 1 : ease((u - 0.16)/0.64);
    const press = u < 0.16 ? Math.min(1, u/0.1) : u < 0.8 ? 1 : Math.max(0, 1 - (u - 0.8)/0.08);
    const alpha = u < 0.06 ? u/0.06 : u > 0.9 ? Math.max(0, 1 - (u - 0.9)/0.1) : 1;
    const p = at(tr*total);
    put(hand, 'transform', `translate(${f(p.x - 12)}px,${f(p.y - 1)}px) scale(${(1 - 0.18*press).toFixed(3)})`);
    put(hand, 'opacity', alpha.toFixed(2));
    put(dragEls.done, 'strokeDasharray', `${f(tr*total)} ${f(total + 20)}`);
    put(dragEls.done, 'opacity', (press > 0 ? alpha : 0).toFixed(2));
    // what to do, in a label by the start: off the far side of the path from where it goes, or above a turn
    const lbl = dg.look ? 'Press, hold & drag to turn the view' : dg.turn ? 'Press, hold & circle round' : 'Press, hold & drag';
    if (lbl !== lastLbl){ lastLbl = lbl; dragLbl.innerHTML = '<i class="fa-solid fa-computer-mouse"></i><span>' + lbl + '</span>'; dragLbl._w = 0; }
    if (!dragLbl._w){ dragLbl._w = dragLbl.offsetWidth; dragLbl._h = dragLbl.offsetHeight; }
    const lw = dragLbl._w || 150, lh = dragLbl._h || 26;
    let lx, ly;
    if (dg.turn || dg.look){
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      lx = (Math.min(...xs) + Math.max(...xs))/2 - lw/2; ly = Math.min(...ys) - lh - 26;
      if (ly < 8) ly = Math.max(...ys) + 26;
    } else {
      const s0 = at(0), L = Math.hypot(s0.ax, s0.ay) || 1, ax = s0.ax/L, ay = s0.ay/L;
      lx = pts[0].x - ax*(lw/2 + 34) - lw/2; ly = pts[0].y - ay*(lh/2 + 30) - lh/2;
      if (Math.abs(ay) < 0.5) ly -= lh + 6;   // a sideways drag: the label sits up out of the path's way
    }
    lx = Math.max(8, Math.min(innerWidth - lw - 8, lx)); ly = Math.max(8, Math.min(innerHeight - lh - 8, ly));
    put(dragLbl, 'transform', `translate(${f(lx)}px,${f(ly)}px)`);
  }

  btn.addEventListener('click', start);
})();
