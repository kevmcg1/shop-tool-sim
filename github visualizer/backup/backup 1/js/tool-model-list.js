/* Sample cutters for the Tool Models shelf. Sizes are in mm because that is
   what the tool builder works in; the fractional inch each one stands for is in
   the name. Clicking one loads it against the T number written here. */

window.TOOL_MODEL_SAMPLES = [
  {
    key: "em500",
    name: "T1 · 1/2\" flat endmill",
    note: "4 flute · carbide",
    doc: {
      format: "toolmodel", version: 1, units: "mm",
      tools: [{
        number: 1, name: "1/2\" 4FL flat endmill", type: "endmill",
        params: { category: "endmill", endType: "flat", dia: 12.7, shankDia: 12.7,
                  loc: 32, oal: 76, flutes: 4, helix: 35, coating: "tialn" },
      }],
    },
  },
  {
    key: "em250b",
    name: "T4 · 1/4\" ball nose",
    note: "2 flute · finishing",
    doc: {
      format: "toolmodel", version: 1, units: "mm",
      tools: [{
        number: 4, name: "1/4\" 2FL ball nose", type: "endmill",
        params: { category: "endmill", endType: "ball", dia: 6.35, shankDia: 6.35,
                  loc: 19, oal: 63, flutes: 2, helix: 30, coating: "altin" },
      }],
    },
  },
  {
    key: "drill312",
    name: "T3 · 5/16\" jobber drill",
    note: "118° point · HSS",
    doc: {
      format: "toolmodel", version: 1, units: "mm",
      tools: [{
        number: 3, name: "5/16\" jobber drill", type: "drill",
        params: { category: "drill", dia: 7.94, shankDia: 7.94, loc: 62, oal: 110,
                  flutes: 2, pointAngle: 118, material: "hss", coating: "none" },
      }],
    },
  },
  {
    key: "spot375",
    name: "T2 · 3/8\" spot drill",
    note: "90° point",
    doc: {
      format: "toolmodel", version: 1, units: "mm",
      tools: [{
        number: 2, name: "3/8\" 90° spot drill", type: "spotdrill",
        params: { category: "spotdrill", dia: 9.53, shankDia: 9.53, loc: 16, oal: 66,
                  flutes: 2, pointAngle: 90, coating: "tin" },
      }],
    },
  },
  {
    key: "cham500",
    name: "T8 · 1/2\" chamfer mill",
    note: "90° included",
    doc: {
      format: "toolmodel", version: 1, units: "mm",
      tools: [{
        number: 8, name: "1/2\" 90° chamfer mill", type: "chamfer",
        params: { category: "chamfer", dia: 12.7, shankDia: 12.7, coneAngle: 90,
                  tipDia: 1.5, loc: 10, oal: 63, flutes: 4, coating: "tialn" },
      }],
    },
  },
  {
    key: "tap2520",
    name: "T5 · 1/4\"–20 tap",
    note: "spiral point · plug",
    doc: {
      format: "toolmodel", version: 1, units: "mm",
      tools: [{
        number: 5, name: "1/4-20 UNC spiral point tap", type: "tap",
        params: { category: "tap", dia: 6.35, shankDia: 6.35, pitch: 1.27,
                  loc: 20, oal: 63, flutes: 3, leadStyle: "plug",
                  material: "hss", coating: "none" },
      }],
    },
  },
];

/* Codes pasted in here load at start-up, same as typing them into the box. */
window.TOOL_MODELS = [

];
