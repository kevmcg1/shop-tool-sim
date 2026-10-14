// The first words of "How do I use it?": a different warm, confident opening every time the walkthrough starts, so it never sounds scripted.
// Two short lines each: a friendly greeting (sometimes a light joke) and a reassurance. The same one never comes up twice in a row.
//   window.__quip.next()   picks one (call it when the walkthrough starts)
//   window.__quip.cur      the picked lines, with \n between them
(function(){
  const LINES = [
    'Hi, and welcome. This is a skill, not a talent, and it is very learnable.\nI’ll walk you through it, and you’ll be doing it on your own before long.',
    'Hello. Measuring well takes a steady hand and a few good habits, nothing more.\nWe’ll build both, one small step at a time.',
    'Hey there. If a reading has ever left you doubting yourself, that’s completely normal.\nYou’re about to learn exactly what to do about it.',
    'Hi. Thousandths of an inch have a reputation for being fussy.\nWith the right habits, they’ll be your friends.',
    'Welcome. No step in this walkthrough is hard, and none of it is a trick.\nWe’ll do it together, and it will make sense.',
    'Hello. The tool does half the work, and a few habits do the other half.\nI’ll show you both, and you’ll pick them up fast.',
    'Hey. Precision sounds intimidating, but it’s mostly patience, and you’ve got plenty.\nLet’s put it to good use.',
    'Hi there. Nobody reads a tool perfectly the first time, and that’s fine.\nBy the end of this, you’ll read it like you’ve done it for years.',
    'Welcome. Think of this as a guided first job with a friendly voice nearby.\nTake your time. I’m right here.',
    'Hello. You’re in the right place, and you’re going to be good at this.\nStep by step, we’ll get you a reading you can trust.',
    'Hey, glad you’re here. Mistakes are cheap in a simulator, which makes it the best place to learn.\nGo easy on yourself, and let’s start.',
    'Hi. Good measuring is mostly knowing where to look and when to slow down.\nI’ll point you to both.',
    'Hello. Every good machinist stood exactly where you’re standing now.\nThe only difference is practice, and today you start.',
    'Hi. I’ll keep this calm and clear, because careful beats fast every time.\nThere’s no rush, and no wrong way to ask for a second look.',
    'Welcome. A measurement is just a question asked politely, and the answer is always in the tool.\nLet’s learn how to listen.',
    'Hey there. You don’t need to be fast, and you don’t need to be perfect.\nYou just need to know the next step, and I’ll give it to you.'
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
