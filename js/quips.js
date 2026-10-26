// The first words of "How do I use it?": a different warm, confident opening every time the walkthrough starts, so it never sounds scripted.
// Two short lines each: a friendly greeting (sometimes a light, fond nod to the creator's early days, always about years ago) and a confident reassurance. The same one never comes up twice in a row.
//   window.__quip.next()   picks one (call it when the walkthrough starts)
//   window.__quip.cur      the picked lines, with \n between them
(function(){
  const LINES = [
    // (a nod to the creator's early days is always about years ago, kept subtle and never a big blunder, and always ends with the promise that you'll be every bit as good)
    'Hi, and welcome. Years ago, when I was learning this, a scale or two took me a second look.\nYou’re going to be every bit as good as I am now, and I have a feeling you’ll get there faster than I did.',
    'Hello. Years back, my first readings were a line or so off here and there, and that’s how I learned to double-check.\nYou’ll be just as good as I am today, and honestly, I’m excited to see how quickly you pick it up.',
    'Hey there. Years ago I learned the ratchet is there for a reason: a light, steady touch gives the true reading.\nYou’ll have that touch in no time, and it’s going to feel great when it clicks.',
    'Hi. Back when I started, years ago, I figured an odd reading meant the tool.\nTurns out it’s almost always technique, and technique is something you’re about to get really good at.',
    'Welcome. Years ago I stood right where you are now.\nI got good at it, and so will you, one small win at a time. You’re in the right place.',
    'Hello. Years ago, I learned that measuring one hole a few times can give a few slightly different answers.\nNow I know why, and by the end of this, so will you. You’re going to feel so sharp.',
    'Hi there. Years ago, thousandths of an inch felt a little like magic to me.\nThey’re real, they’re readable, and you’re about to read them with real confidence.',
    'Hey. Years back, I learned to check that a gauge sits square before I trust the answer.\nIt’s a great habit, and you’re about to pick it up like a natural.',
    'Hi. This is a skill, not a talent, which means anyone can master it, and you’re clearly ready to.\nI’ll be with you the whole way, and soon you’ll be doing it on your own and loving it.',
    'Hello. Measuring well takes a steady hand and a few good habits, and you already have what it takes to build both.\nWe’ll do it one small win at a time, and you’ll feel the progress as we go.',
    'Welcome. If a reading has ever left you doubting yourself, that’s completely normal, and it’s about to change.\nYou’ll finish this knowing exactly what to do, and trusting yourself while you do it.',
    'Hi. Thousandths of an inch have a reputation for being fussy.\nWith the right habits they become your friends, and you’re about to make a lot of friends.',
    'Hello. The tool does half the work and a few good habits do the other half.\nI’ll show you both, and you’re going to be amazed at how fast it comes together.',
    'Hey there. Nobody reads a tool perfectly the first time, and every great machinist started right here.\nBy the end of this you’ll read it like you’ve done it for years. You’ve got this.',
    'Welcome. Years ago I needed someone to walk me through this, and it made all the difference.\nNow I get to do that for you, and I can’t wait to watch you be just as good.',
    'Hi. Mistakes are cheap in a simulator, which makes it the best place to learn.\nBe proud of showing up. It took me a while to get good, and you’re going to do it in far less.'
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
