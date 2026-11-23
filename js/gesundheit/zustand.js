// Gemeinsamer Zwischenspeicher der Gesundheits-Module (Medikamente, Symptome, Labor, Bestleistungen)

export const state = {
  meds:[],
  intakes:[],
  intakeDay:"",
  symptoms:[],
  labs:[],
  prs:null,
  medLoad:0,
  symLoad:0,
  labLoad:0,
  prLoad:0,
  pendingFactor:null
};
