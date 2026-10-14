// The version of Shop Tool Sim and what changed in each one. Every tool and the page around them read this one file,
// so the version number and the changelog are always the same everywhere. To release: add an entry to the top of
// `changelog`, set `version` to match, and raise the ?v=N on every css/ and js/ link in index.html.
// Keep each version to three sentences at most.
window.__SHOP = {
  version: '1.2.2',
  changelog: [
    { v: '1.2.2', date: '2026-10-14', title: 'A slimmer gauge and a longer walkthrough', items: [
      'The telescopic gauge is slimmer and plainer, copied from a photo of a real set, and its top-left card is easier to read.',
      'The gauge now lands on the micrometer or caliper at the same angle it flew in at, and How do I use it? carries on there to show the same number on both sides.',
      'On the height gage, How do I use it? now pans down to the plate at zero, and every checkbox is now round and animated.'
    ] },
    { v: '1.2.1', date: '2026-10-13', title: 'Split-screen measuring and a truer gauge', items: [
      'Measure, Auto measure and the How do I use it? walkthrough now open the micrometer or caliper beside the gauge, with the gauge on it at its exact locked length.',
      'The telescopic gauge is redrawn from a real one, and the micrometer and calipers use the very same model.',
      'Dev mode now grades how smoothly each tool runs and tests every control.'
    ] },
    { v: '1.2.0', date: '2026-10-12', title: 'Shop graphics, a better gauge, faster loading', items: [
      'A new Shop graphics button gives every tool a real machine-shop look, with a ground surface plate under it.',
      'The telescopic gauge looks like a real one, and a Measure button carries it to the micrometer or caliper you choose.',
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
