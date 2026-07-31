const modules = [
  { key: "production", name: "Producție / Operațiuni", activeByDefault: true },
  { key: "technical", name: "Tehnic", activeByDefault: true },
  { key: "accounting", name: "Contabilitate", activeByDefault: true },
  { key: "mechanization", name: "Parc & Resurse", activeByDefault: true },
  { key: "concrete", name: "Beton / Prefabricate", activeByDefault: false },
  { key: "paving", name: "Lucrări / Execuție", activeByDefault: false },
  { key: "traffic_safety", name: "Siguranta circulatiei", activeByDefault: false },
  { key: "sewerage", name: "Canalizare", activeByDefault: false },
  { key: "inventory", name: "Gestiune", activeByDefault: true },
  { key: "procurement", name: "Achizitii", activeByDefault: true }
];

module.exports = { modules };
