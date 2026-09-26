let toolTable = new Map();
let unitMode = 'inch';
let toolChanges = [];
let spindleChanges = [];
let activeToolNumber = null;
let activeSpindleRPM = null;
let activeSpindleDir = 'cw';

let rotaryMode = 'tool';

const rotaryPivot = new THREE.Vector3(0, 0, 0);

let linearMode = 'tool';

let toolVisible = true;
let toolOpacity = 1;

const ToolShapes = new Map();

let pathsVisible = true;

let dOffsetTable = new Map();
