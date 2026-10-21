// The first words of "How do I use it?": a different warm, confident opening every time the walkthrough starts, so it never sounds scripted.
// Two short lines each: a friendly greeting (sometimes a joke at the creator's expense, always about years ago) and a confident reassurance. The same one never comes up twice in a row.
//   window.__quip.next()   picks one (call it when the walkthrough starts)
//   window.__quip.cur      the picked lines, with \n between them
(function(){
  const LINES = [
    // (a joke at the creator's own expense is always about years ago; the reassurance is that retries are fine and the pace is yours)
    'Hi, and welcome. Years ago, when I was learning this, I misread a scale and proudly wrote down the wrong number.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hello. Years back, my first readings were off by a whole line, and I didn’t notice for weeks.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hey there. Years ago I cranked a micrometer down so hard I nearly bent the frame, and the reading was wrong anyway.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hi. Back when I started, years ago, I blamed the tool for every bad reading.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Welcome. Years ago I struggled with this exactly where you are now.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hello. Years ago, I measured one hole eleven times and got eleven different answers.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hi there. Years ago, I thought thousandths of an inch were a myth.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hey. Years back, I locked a gauge crooked and trusted the answer anyway.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hi. This is a skill, not a talent, and it is very learnable.\nI’ll walk you through it, and you’ll be doing it on your own before long.',
    'Hello. Measuring well takes a steady hand and a few good habits, nothing more.\nWe’ll build both, one small step at a time.',
    'Welcome. If a reading has ever left you doubting yourself, that’s completely normal.\nYou’re about to learn exactly what to do about it.',
    'Hi. Thousandths of an inch have a reputation for being fussy.\nWith the right habits, they’ll be your friends.',
    'Hello. The tool does half the work, and a few habits do the other half.\nI’ll show you both, and you’ll pick them up fast.',
    'Hey there. Nobody reads a tool perfectly the first time, and that’s fine.\nBy the end of this, you’ll read it like you’ve done it for years.',
    'Welcome. Years ago I needed someone to walk me through this, and it made all the difference.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!',
    'Hi. Mistakes are cheap in a simulator, which makes it the best place to learn.\nIf it takes you a couple times, or even tens of times, that’s perfectly fine. Just remember to go at a pace that’s right for you!'
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
