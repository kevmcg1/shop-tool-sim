const CONTOUR_G41_GCODE = `%
O02001 (CONTOUR DEMO - G41 INSIDE - 2x2x0.5 PART, 0.5 IN ENDMILL)
G00 G17 G20 G40 G49 G80 G90
T1 M06 (0.500 IN END MILL)
G54 X0. Y0. S3000 M03
G43 H01 Z1.0 M08

(--- Rapid to lead-in start ---)
G00 X-0.5 Y-0.5
G00 Z0.1
G01 Z-0.5 F8.0

(--- Activate cutter comp left, lead in to first corner ---)
G41 D01 X0. Y0. F25.0

(--- Trace 2x2 square counterclockwise -- G41 puts tool inside ---)
G01 X2.0 Y0.
G01 X2.0 Y2.0
G01 X0.    Y2.0
G01 X0.    Y0.

(--- Lead out and cancel cutter comp ---)
G01 X-0.5 Y-0.5
G40

(--- Retract ---)
G00 Z1.0
M09
M05
G53 G49 Z0.
G53 Y0.
M30
%`;

const CONTOUR_G42_GCODE = `%
O02002 (CONTOUR DEMO - G42 OUTSIDE - 2x2x0.5 PART, 0.5 IN ENDMILL)
G00 G17 G20 G40 G49 G80 G90
T1 M06 (0.500 IN END MILL)
G54 X0. Y0. S3000 M03
G43 H01 Z1.0 M08

(--- Rapid to lead-in start ---)
G00 X-0.5 Y-0.5
G00 Z0.1
G01 Z-0.5 F8.0

(--- Activate cutter comp right, lead in to first corner ---)
G42 D01 X0. Y0. F25.0

(--- Trace 2x2 square counterclockwise -- G42 puts tool outside ---)
G01 X2.0 Y0.
G01 X2.0 Y2.0
G01 X0.    Y2.0
G01 X0.    Y0.

(--- Lead out and cancel cutter comp ---)
G01 X-0.5 Y-0.5
G40

(--- Retract ---)
G00 Z1.0
M09
M05
G53 G49 Z0.
G53 Y0.
M30
%`;

const POCKET_G12_GCODE = `%
O03001 (POCKET MILL DEMO - G12 HAAS CIRCULAR POCKET)
(1.5 IN DIA POCKET, 0.5 IN ENDMILL, 0.25 IN DEPTH)
G00 G17 G20 G40 G49 G80 G90
T1 M06 (0.500 IN END MILL)
G54 X0. Y0. S3500 M03
G43 H01 Z1.0 M08

(--- Rapid to pocket center ---)
G00 X0. Y0.
G00 Z0.1

(--- Plunge to depth ---)
G01 Z-0.25 F5.0

(--- G12 clockwise circular pocket ---)
(--- I = first-cut radius, K = finish radius, Q = radial stepover ---)
G12 I0.30 K0.75 Q0.25 D01 F20.0

(--- Retract ---)
G00 Z1.0
M09
M05
G53 G49 Z0.
G53 Y0.
M30
%`;

(function() {
  loadGCode(CONTOUR_G42_GCODE);
  updateHighlight();

  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => {
    if (!window.PartModels) return;
    try {
      if (window.PartModels.bootDefault && window.PartModels.bootDefault()) {
        showToast('Your saved setup is back',
          'The blank, vice and program you left last time. Guide Me Through It \u25B8 Start fresh puts the demo back.');
        return;
      }
      if (typeof window.PartModels.sampleStock === 'function') {
        window.PartModels.sampleStock('contourG42');
        rewindSimToStart();
      }
    } catch (e) { console.warn('[Boot]', e); }
  }));
})();

function loadSampleStock(key) {
  if (window.PartModels && typeof window.PartModels.sampleStock === 'function') {
    try { window.PartModels.sampleStock(key); }
    catch (e) { console.warn('[Sample stock]', e); }
  }
}

document.getElementById('btn-load-drill').addEventListener('click', () => {
  loadGCode(DRILL_DEMO_GCODE);
  loadSampleStock('drill');
  rewindSimToStart();
  showToast('Drilling demo loaded',
    'Four rows of holes in a 6 \u00D7 5 \u00D7 1 mild steel plate, showing G81 through G84 \u2014 plain, dwell, peck and tapping.');
});

document.getElementById('btn-load-multiaxis').addEventListener('click', () => {
  loadGCode(MULTIAXIS_DEMO_GCODE);
  loadSampleStock('multiaxis');
  rewindSimToStart();
  showToast('Multi-axis demo loaded',
    'Rapid moves with an A word in them, over a 6 \u00D7 5 \u00D7 1 aluminium block, so you can see the rotary envelope.');
});

document.getElementById('btn-load-engrave').addEventListener('click', () => {
  loadGCode(ENGRAVE_DEMO_GCODE);
  loadSampleStock('engrave');
  rewindSimToStart();
  showToast('Engraving demo loaded',
    'Four lines of G47 text cut five thou deep into a 5 \u00D7 6 \u00D7 \u00BD aluminium nameplate.');
});

document.getElementById('btn-load-contour-g41').addEventListener('click', () => {
  loadGCode(CONTOUR_G41_GCODE);
  loadSampleStock('contourG41');
  rewindSimToStart();
  showToast('Inside contour demo loaded',
    'G41 puts the cutter inside the square, so a 3\u00BD \u00D7 3\u00BD \u00D7 \u00BD blank comes out with a 2 \u00D7 2 pocket through it.');
});

document.getElementById('btn-load-contour-g42').addEventListener('click', () => {
  loadGCode(CONTOUR_G42_GCODE);
  loadSampleStock('contourG42');
  rewindSimToStart();
  showToast('Outside contour demo loaded',
    'G42 puts the cutter outside the square, so a 3 \u00D7 3 \u00D7 \u00BD blank comes out with a 2 \u00D7 2 boss standing on it.');
});

document.getElementById('btn-load-pocket-g12').addEventListener('click', () => {
  loadGCode(POCKET_G12_GCODE);
  loadSampleStock('pocketG12');
  rewindSimToStart();
  showToast('Circular pocket demo loaded',
    'A Haas G12 bores a \u00D81.5 pocket a quarter deep into a 3 \u00D7 3 \u00D7 \u00BE aluminium block.');
});
