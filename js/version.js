// The version of Shop Tool Sim and what changed in each one. Every tool and the page around them read this one file,
// so the version number and the changelog are always the same everywhere. To release: add an entry to the top of
// `changelog`, set `version` to match, and raise the ?v=N on every css/ and js/ link in index.html.
// Keep each version to three sentences at most.
window.__SHOP = {
  version: '1.2.8',
  changelog: [
    { v: '1.2.8', date: '2026-10-14', title: 'Reset buttons and a tidier help section', items: [
      'Every slider now has a Reset to default button beside it (double-clicking the slider does the same).',
      'On the telescopic gauge, dragging the view turns it about the point under your pointer.',
      'The help section at the bottom of each sidebar is reorganized into Reading it, Mouse and Keys.'
    ] },
    { v: '1.2.7', date: '2026-10-14', title: 'A fresh walkthrough', items: [
      'How do I use it? now opens with a different friendly line every time, and its wording is warmer and more confident.',
      'The telescopic gauge walkthrough follows real shop practice more closely, including checking the tool you measure with.',
      'Examine labels pop in one at a time on every tool, and the BEST tag never overlaps anything.'
    ] },
    { v: '1.2.6', date: '2026-10-14', title: 'Smoother labels', items: [
      'On the telescopic gauge, the BEST tag now eases in and glides from one size to the next.',
      'Part labels and Examine labels pop in one at a time, like bubbles.'
    ] },
    { v: '1.2.5', date: '2026-10-14', title: 'Quick controls and better views', items: [
      'The telescopic gauge has quick controls at the bottom left like the other tools, its Examine button works again, and its Hole and Top views now show the hole.',
      'Sidebar categories have a new look, side-by-side buttons are the same height, and the gauge arrows are smaller and further apart.',
      'Opening and closing the side panel on the telescopic gauge is smooth.'
    ] },
    { v: '1.2.4', date: '2026-10-14', title: 'A calmer table and tidier panels', items: [
      'The measuring table is now an even dark gray with barely any marks, so it no longer flashes light and dark when you rotate the view.',
      'The Sample and Part panels have cleaner feature cards, and the telescopic gauge uses the same tooltips as the other tools (never cut off by the window).',
      'On the calipers, the gauge you send over is now drawn by the caliper itself, so the jaws and slider hide it where they should.'
    ] },
    { v: '1.2.3', date: '2026-10-14', title: 'Phone heads-up and gauge buttons', items: [
      'Phones and tablets now get a pop-up saying the simulator is best on a laptop or desktop, with a Continue anyway button.',
      'The telescopic gauge has the same top-left buttons as the other tools: the side panel, Examine and Practice.'
    ] },
    { v: '1.2.2', date: '2026-10-14', title: 'A slimmer gauge and a longer walkthrough', items: [
      'The telescopic gauge has a slimmer, plainer look, and its top-left card is easier to read.',
      'The gauge now lands on the micrometer or caliper at the same angle it flew in at, and How do I use it? carries on there to show the same number on both sides.',
      'On the height gage, How do I use it? now pans down to the plate at zero, and every checkbox is now round and animated.'
    ] },
    { v: '1.2.1', date: '2026-10-13', title: 'Split-screen measuring and a truer gauge', items: [
      'Measure, Auto measure and the How do I use it? walkthrough now open the micrometer or caliper beside the gauge, with the gauge on it at its exact locked length.',
      'The telescopic gauge has a new look, and the micrometer and calipers use the very same model.',
      'Dev mode now grades how smoothly each tool runs and tests every control.'
    ] },
    { v: '1.2.0', date: '2026-10-12', title: 'Shop graphics, a better gauge, faster loading', items: [
      'A new Shop graphics button gives every tool a real machine-shop look, with a ground surface plate under it.',
      'The telescopic gauge has a better look, and a Measure button carries it to the micrometer or caliper you choose.',
      'Tools load faster, and every icon now moves when you point at it.'
    ] },
    { v: '1.1.0', date: '2026-10-12', title: 'Telescopic gauge', items: [
      'A new Telescopic gauge tab has a six-gauge set (A to F) you can lock in a hole in 3D and then measure on the micrometer or caliper.',
      'How do I use it? now starts by cleaning and zeroing the tool, and ends with a note on tolerances.',
      'The written tutorials are gone, so How do I use it? is the one way in.'
    ] },
    { v: '1.0.0', date: '', title: 'First release', items: [
      'Dial caliper, vernier caliper, outside micrometer, depth micrometer and height gage trainers, with How do I use it?, Practice and Examine.'
    ] }
  ]
};
