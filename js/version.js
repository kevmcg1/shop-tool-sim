// The version of Shop Tool Sim and what changed in each one. Every tool and the page around them read this one file,
// so the version number and the changelog are always the same everywhere. To release: add an entry to the top of
// `changelog`, set `version` to match, and raise the ?v=N on every css/ and js/ link in index.html.
// Keep ONE entry per day, and each entry to ONE short, simple sentence: if today already has an entry, add to its sentence instead of a new entry.
window.__SHOP = {
  version: '1.3.30',
  changelog: [
    { v: '1.3.30', date: '2026-10-25', title: 'Bubbles on load', items: ['Buttons and cards now pop in one by one, like bubbles, each time a tool loads.'] },
    { v: '1.3.29', date: '2026-10-24', title: 'Friendlier walkthroughs and sturdier knobs', items: ['Walkthroughs are friendlier, the micrometer frame is a U, and opening the inspector shows a no-cheating note.'] },
    { v: '1.3.28', date: '2026-10-23', title: 'Gentler openers and a range check', items: ['The How do I use it? openers are lighter and the micrometer walkthrough checks its range first.'] },
    { v: '1.3.27', date: '2026-10-22', title: 'Crisper walkthrough text', items: ['The How do I use it? card text is now sharper.'] },
    { v: '1.3.26', date: '2026-10-21', title: 'Mouse controls and readings', items: ['A mouse-controls settings cog was added, and readings are now said in full.'] },
    { v: '1.3.20', date: '2026-10-20', title: 'How do I read this?', items: ['Every measurement now has a How do I read this? button.'] },
    { v: '1.3.19', date: '2026-10-16', title: 'Practice carries over', items: ['Practice mode now carries over when you send the gauge from the telescopic lab.'] },
    { v: '1.3.18', date: '2026-10-15', title: 'A truer walkthrough', items: ['The telescopic gauge walkthrough and cleaning step now follow real shop practice.'] },
    { v: '1.2.8', date: '2026-10-14', title: 'Resets and smoother labels', items: ['Every slider has a Reset button, and the telescopic gauge is tidier and smoother.'] },
    { v: '1.2.1', date: '2026-10-13', title: 'Split-screen measuring', items: ['Measure now opens the micrometer or caliper beside the telescopic gauge.'] },
    { v: '1.2.0', date: '2026-10-12', title: 'Shop graphics and a telescopic gauge', items: ['Shop graphics and a telescopic gauge were added, and tools load faster.'] },
    { v: '1.0.0', date: '', title: 'First release', items: ['The dial and vernier calipers, outside and depth micrometers and height gage trainers.'] }
  ]
};
