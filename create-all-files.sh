#!/bin/bash
# Script para crear todos los archivos del proyecto refactorizado

BASE_DIR="/tmp/almendros-refactored"
cd "$BASE_DIR"

echo "🚀 Creando estructura completa de Almendros Mall Vite..."

# src/data/constants.js
mkdir -p src/data
cat > src/data/constants.js << 'ENDCONST'
export const REND = {
  exc: 1.33,
  anillo: 0.377,
  fuste: 0.953,
  campana: {
    "1.8": { vol: 1.57, alt: 0.7 },
    "2.0": { vol: 2.31, alt: 0.9 },
    "2.2": { vol: 3.20, alt: 1.1 },
    "2.4": { vol: 4.25, alt: 1.3 }
  }
};

export const ITEMS = {
  EXC_0_3:     { code:"3,002,1,2", ref:"6302", billKey:"e03",   unit:"m3", name:"EXCAVACION EN TIERRA DE CAISSON PROF=0-3M" },
  EXC_3_6:     { code:"3,002,1,3", ref:"6302", billKey:"e36",   unit:"m3", name:"EXCAVACION EN TIERRA DE CAISSON PROF=3-6M" },
  EXC_6_9:     { code:"3,002,1,4", ref:"6302", billKey:"e69",   unit:"m3", name:"EXCAVACION EN TIERRA DE CAISSON PROF=6-9M" },
  EXC_CAMPANA: { code:"3,004-P",   ref:"2324", billKey:"vEC",   unit:"m3", name:"EXCAVACIÓN CAMPANA CAISSON TIERRA" },
  ANILLOS_A:   { code:"3,003,1",   ref:"6304", billKey:"vA",    unit:"m3", name:"ANILLOS PARA CAISSON" },
  ANILLOS_B:   { code:"3,003,1",   ref:"6703", billKey:"vA",    unit:"m3", name:"ANILLOS PARA CAISSON" },
  FUSTE_A:     { code:"3,003,4",   ref:"6305", billKey:"vF",    unit:"m3", name:"FUSTE EN CONCRETO" },
  FUSTE_B:     { code:"3,003,4",   ref:"6703", billKey:"vF",    unit:"m3", name:"FUSTE EN CONCRETO" },
  CAMPANA_A:   { code:"3,003,2",   ref:"2463", billKey:"vC",    unit:"m3", name:"CAMPANA EN CONCRETO" },
  CAMPANA_B:   { code:"3,003,2",   ref:"6703", billKey:"vC",    unit:"m3", name:"CAMPANA EN CONCRETO" },
  ACERO:       { code:"3,003,6",   ref:"2236", billKey:"acero", unit:"kg", name:"ACERO DE REFUERZO CAISSON - 12 N7 DE 6 M 12.7.600" },
};

export const CAISSONS = [
  { k:7,  fuste:1, prof:7, campana:2.0, profCampana:0.9, profFuste:6.1, peso:240.92, ref:"6.7.610+6.7.710" },
  { k:8,  fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:12, fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:11, fuste:1, prof:7, campana:2.0, profCampana:0.9, profFuste:6.1, peso:240.92, ref:"6.7.610+6.7.710" },
  { k:15, fuste:1, prof:7, campana:2.0, profCampana:0.9, profFuste:6.1, peso:240.92, ref:"6.7.610+6.7.710" },
  { k:16, fuste:1, prof:7, campana:2.4, profCampana:1.3, profFuste:5.7, peso:226.32, ref:"6.7.570+6.7.670" },
  { k:23, fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:24, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:25, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:26, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:20, fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:19, fuste:1, prof:7, campana:2.0, profCampana:0.9, profFuste:6.1, peso:240.92, ref:"6.7.610+6.7.710" },
  { k:6,  fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:10, fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:14, fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:18, fuste:1, prof:7, campana:2.2, profCampana:1.1, profFuste:5.9, peso:233.62, ref:"6.7.590+6.7.690" },
  { k:22, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:21, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:17, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:13, fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:9,  fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:5,  fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:1,  fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:2,  fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:3,  fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" },
  { k:4,  fuste:1, prof:7, campana:1.8, profCampana:0.7, profFuste:6.3, peso:248.22, ref:"6.7.630+6.7.730" }
];

export const CAISSON_MAP = Object.fromEntries(CAISSONS.map(c => [c.k, c]));

export const EJES_Y = [
  { label:"A", dist:0 },
  { label:"B", dist:3.70 },
  { label:"C", dist:11.11 },
  { label:"D", dist:15.2 }
];

export const EJES_X = [
  { label:"1", dist:0 },
  { label:"2", dist:8 },
  { label:"3", dist:16 },
  { label:"4", dist:24 },
  { label:"5", dist:32 },
  { label:"6", dist:41 },
  { label:"7", dist:44.68 },
  { label:"8", dist:48.66 }
];

export const KMAP = {
  "A-1":4,"A-2":8,"A-3":12,"A-4":16,"A-5":20,"A-6":24,"A-7":25,"A-8":26,
  "B-1":3,"B-2":7,"B-3":11,"B-4":15,"B-5":19,"B-6":23,
  "C-1":2,"C-2":6,"C-3":10,"C-4":14,"C-5":18,"C-6":22,
  "D-1":1,"D-2":5,"D-3":9,"D-4":13,"D-5":17,"D-6":21
};

export const EJE_X_MAP = Object.fromEntries(EJES_X.map(e => [e.label, e.dist]));
export const EJE_Y_MAP = Object.fromEntries(EJES_Y.map(e => [e.label, e.dist]));

export const CAISSON_COORDS = (() => {
  const rev = Object.fromEntries(Object.entries(KMAP).map(([key,k]) => [k, key]));
  return Object.fromEntries(
    Object.entries(rev).map(([k, name]) => {
      const [ej, ez] = name.split('-');
      return [k, { x: EJE_X_MAP[ez], y: EJE_Y_MAP[ej] }];
    })
  );
})();
ENDCONST

echo "✓ src/data/constants.js created"
echo "✓ Proyecto refactorizado estructura básica lista"
echo ""
echo "Archivos creados: $(find . -type f | wc -l)"
echo "Próximo paso: npm install && npm run dev"
