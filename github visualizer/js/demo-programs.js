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

/* Touching off with nothing but the probe.
 *
 * Five G31 skip moves and not one cutting block: four round the sides of a
 * 3 × 3 × 1 block to find its centre, one down the middle to find the top.
 * The stock sample puts program zero on the centre of the top face already,
 * so the touches land exactly on the faces — this is what the run looks like
 * when the offset is right, which is the picture worth having in your head
 * before you go looking at one that is wrong.
 *
 * The G31 targets are written at the trip point, one ball radius off the
 * face (0.1181 for a 6 mm ruby), rather than a thou or two into the metal
 * the way a real block is written. On the machine the control stops the move
 * on the touch signal; nothing here listens for one, so a target buried in
 * the blank would draw the stylus buried in the blank. Written this way the
 * line ends where the ruby actually lands.
 */
const PROBE_TOUCHOFF_GCODE = `%
O04001 (PROBE TOUCH-OFF - FIND A 3 X 3 X 1 BLOCK WITH THE PROBE ALONE)
(T20 IS A SPINDLE TOUCH PROBE - 6 MM / 0.2362 IN RUBY BALL)
(NOT ONE CUTTING BLOCK IN HERE. NOTHING IS REMOVED.)
(EVERY FEED MOVE IS A G31 SKIP - THE CONTROL STOPS IT ON THE TOUCH.)
G00 G17 G20 G40 G49 G80 G90
T20 M06 (TOUCH PROBE)
G54 X0. Y0.
M05 (A PROBE NEVER TURNS - NO S WORD ANYWHERE BELOW)
M59 P1134 (PROBE ON)
G43 H20 Z2.0 (THE PROBE IS LONG - COME IN HIGH)

(--- 1. TOP FACE, FOR Z ---)
G00 X0. Y0.
G00 Z0.4
G31 Z0.1181 F10. (BALL CENTRE STOPS ONE RADIUS ABOVE THE FACE)
G00 Z2.0
(#5063 NOW HOLDS THE MACHINE Z OF THAT TOUCH)
(#5223= #5063 - 0.1181 WOULD DROP G54 Z ONTO THE TOP FACE)

(--- 2. X MINUS FACE ---)
G00 X-2.2 Y0.
G00 Z-0.5 (HALF WAY DOWN THE SIDE, CLEAR OF THE BLOCK)
G31 X-1.6181 F10.
G00 X-2.2
G00 Z2.0

(--- 3. X PLUS FACE ---)
G00 X2.2
G00 Z-0.5
G31 X1.6181 F10.
G00 X2.2
G00 Z2.0
(THE TWO X TOUCHES AVERAGE TO THE CENTRE - THAT IS G54 X)

(--- 4. Y MINUS FACE ---)
G00 X0. Y-2.2
G00 Z-0.5
G31 Y-1.6181 F10.
G00 Y-2.2
G00 Z2.0

(--- 5. Y PLUS FACE ---)
G00 Y2.2
G00 Z-0.5
G31 Y1.6181 F10.
G00 Y2.2
G00 Z2.0
(AND THE TWO Y TOUCHES AVERAGE TO G54 Y)

(--- PUT THE PROBE AWAY ---)
M69 P1134 (PROBE OFF)
G00 X0. Y0.
M09
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
          'The blank, vise and program you left last time. Guide Me Through It \u25B8 Start fresh puts the demo back.');
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

/* Put a real cutter in the spindle for a sample.
 *
 * `shape` drives what the solid simulation carves \u2014 a drill leaves a conical
 * bottom, an endmill a flat one \u2014 and `model` builds the actual tool so the
 * thing on screen is a drill bit rather than a plain cylinder with flutes
 * drawn on it. Diameters are inches here; the tool model wants millimeters.
 */
function setSampleTool(num, dia, shape, model) {
  try {
    if (typeof toolTable !== 'undefined') toolTable.set(num, dia);
    if (typeof ToolShapes !== 'undefined' && shape) ToolShapes.set(num, shape);
    if (typeof updateToolTableUI === 'function') updateToolTableUI();

    if (model && typeof ToolModel !== 'undefined' && window.ToolModels) {
      const params = Object.assign({ dia: dia * 25.4, shankDia: dia * 25.4 }, model);
      window.ToolModels.add(
        ToolModel.encode(params, { number: num, name: model.name }),
        { quiet: true, syncDiameter: false });
      if (window.ToolModels.relabel) window.ToolModels.relabel();
      if (window.ToolModels.refresh) window.ToolModels.refresh();
    }
  } catch (e) { console.warn('[Sample tool]', e); }
}

document.getElementById('btn-load-drill').addEventListener('click', () => {
  loadGCode(DRILL_DEMO_GCODE);
  loadSampleStock('drill');
  /* It is a drilling program, so T1 is a drill \u2014 a 118\u00B0 jobber long enough to
     reach the 0.750 peck, not the half-inch endmill it used to run. */
  setSampleTool(1, 0.5, 'drill', {
    category: 'drill', pointAngle: 118, flutes: 2, helix: 30,
    loc: 60, oal: 110, name: '\u00D8.500 jobber drill',
  });
  rewindSimToStart();
  showToast('Drilling demo loaded',
    'Four rows of holes in a 6 \u00D7 5 \u00D7 1 mild steel plate, showing G81 through G84 \u2014 plain, dwell, peck and tapping. T1 is a \u00D8\u00BD 118\u00B0 jobber drill.');
});

document.getElementById('btn-load-multiaxis').addEventListener('click', () => {
  loadGCode(MULTIAXIS_DEMO_GCODE);
  loadSampleStock('multiaxis');
  rewindSimToStart();
  showToast('Multi-axis demo loaded',
    'Rapid moves with an A word in them, over a 6 \u00D7 5 \u00D7 1 aluminum block, so you can see the rotary envelope.');
});

document.getElementById('btn-load-engrave').addEventListener('click', () => {
  loadGCode(ENGRAVE_DEMO_GCODE);
  loadSampleStock('engrave');
  rewindSimToStart();
  showToast('Engraving demo loaded',
    'Four lines of G47 text cut five thou deep into a 5 \u00D7 6 \u00D7 \u00BD aluminum nameplate.');
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

document.getElementById('btn-load-probe').addEventListener('click', () => {
  loadGCode(PROBE_TOUCHOFF_GCODE);
  loadSampleStock('probeTouchoff');
  /* The one sample whose T number holds nothing that cuts. The tool table
     gets the ruby ball diameter, because that is the number a touch-off
     works from; the sim reads the "probe" shape and takes no metal off. */
  setSampleTool(20, 0.2362, 'probe', {
    category: 'probe', styDia: 3, styLen: 50, bodyDia: 40, shankDia: 20,
    oal: 150, name: 'Ø6 mm ruby ball touch probe',
  });
  rewindSimToStart();
  showToast('Probe touch-off demo loaded',
    'Five G31 skip moves find a 3 × 3 × 1 block — four sides for X and Y centre, one down the middle for Z. T20 is a Ø6 mm ruby probe, and nothing is cut.');
});

document.getElementById('btn-load-pocket-g12').addEventListener('click', () => {
  loadGCode(POCKET_G12_GCODE);
  loadSampleStock('pocketG12');
  rewindSimToStart();
  showToast('Circular pocket demo loaded',
    'A Haas G12 bores a \u00D81.5 pocket a quarter deep into a 3 \u00D7 3 \u00D7 \u00BE aluminum block.');
});
