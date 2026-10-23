// The first words of "How do I use it?": a different warm, confident opening every time the walkthrough starts, so it never sounds scripted.
// Two short lines each: a friendly greeting (sometimes a light, fond nod to the creator's early days, always about years ago) and a confident reassurance. The same one never comes up twice in a row.
//   window.__quip.next()   picks one (call it when the walkthrough starts)
//   window.__quip.cur      the picked lines, with \n between them
(function(){
  const LINES = [
    // (a nod to the creator's early days is always about years ago, kept subtle and never a big blunder, and always ends with the promise that you'll be every bit as good)
    'Hi, and welcome. Years ago, when I was learning this, a scale or two took me a second look.\nYou’re going to be every bit as good as I am now, and you’ll get there faster.',
    'Hello. Years back, my first readings were a line or so off here and there, and I learned to double-check.\nYou’ll be just as good as I am today, and this walkthrough will get you there.',
    'Hey there. Years ago I learned the ratchet is there for a reason: a light, steady touch gives the true reading.\nYou’ll have that touch in no time, and be just as steady.',
    'Hi. Back when I started, years ago, I figured an odd reading meant the tool.\nTurns out it’s almost always technique. You’ll pick that up quickly, and you’ll be just as good.',
    'Welcome. Years ago I stood right where you are now.\nI got good at it, and so will you, one small step at a time.',
    'Hello. Years ago, I learned that measuring one hole a few times can give a few slightly different answers.\nNow I know why, and by the end of this, so will you. You’ll be just as good.',
    'Hi there. Years ago, thousandths of an inch felt a little like magic to me.\nThey’re real, they’re readable, and you’ll be reading them as well as I do.',
    'Hey. Years back, I learned to check that a gauge sits square before I trust the answer.\nIt’s a good habit, and you’re about to pick it up quicker and just as well.',
    'Hi. This is a skill, not a talent, and it is very learnable.\nI’ll walk you through it, and you’ll be doing it on your own before long.',
    'Hello. Measuring well takes a steady hand and a few good habits, nothing more.\nWe’ll build both, one small step at a time.',
    'Welcome. If a reading has ever left you doubting yourself, that’s completely normal.\nYou’re about to learn exactly what to do about it.',
    'Hi. Thousandths of an inch have a reputation for being fussy.\nWith the right habits, they’ll be your friends.',
    'Hello. The tool does half the work, and a few habits do the other half.\nI’ll show you both, and you’ll pick them up fast.',
    'Hey there. Nobody reads a tool perfectly the first time, and that’s fine.\nBy the end of this, you’ll read it like you’ve done it for years.',
    'Welcome. Years ago I needed someone to walk me through this, and it made all the difference.\nNow I get to do that for you, and you’ll be just as good.',
    'Hi. Mistakes are cheap in a simulator, which makes it the best place to learn.\nGo easy on yourself. It took me a while to get good, and you’ll do it in far less.'
  ];
  let last = -1;
  try { last = +(localStorage.getItem('pt-quip') || -1); } catch (e) {}
  const q = window.__quip = {
    cur: LINES[0],
    next(){
      let i; do { i = Math.floor(Math.random()*LINES.length); } while (i === last && LINES.length > 1);
      last = i; try { localStorage.setItem('pt-quip', String(i)); } catch (e) {}
      return q.cur = LINES[i];
    }
  };
  q.next();
})();
