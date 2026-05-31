const modules = [
  { key: "production", name: "Productie", activeByDefault: true },
  { key: "technical", name: "Tehnic", activeByDefault: true },
  { key: "accounting", name: "Contabilitate", activeByDefault: true },
  { key: "mechanization", name: "Mecanizare", activeByDefault: true },
  { key: "concrete", name: "Betoane", activeByDefault: false },
  { key: "paving", name: "Asternere asfalt", activeByDefault: false },
  { key: "traffic_safety", name: "Siguranta circulatiei", activeByDefault: false },
  { key: "sewerage", name: "Canalizare", activeByDefault: false },
  { key: "inventory", name: "Gestiune", activeByDefault: true },
  { key: "procurement", name: "Achizitii", activeByDefault: true }
];

module.exports = { modules };

