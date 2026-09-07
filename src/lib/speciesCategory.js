// Odvození kategorie (dravec / bílá ryba) z názvu druhu ryby.
//
// Appka dřív nechávala kategorii u úlovku čistě na typu výpravy
// (TYPE_CATEGORY[session.type]) -- to funguje pro naprostou většinu
// zápisů (na kaprařinu chytáš bílou rybu, na přívlač/mušku dravce), ale
// nesedí to ve chvíli, kdy se na "kaprovou" výpravu chytí třeba sumec.
// Appka proto nejdřív zkusí uhodnout kategorii přímo z NÁZVU DRUHU --
// typ výpravy appka používá jen jako výchozí hodnotu, dokud druh
// nenapíšeš, a jako fallback, pokud appka druh nerozpozná.
//
// Appka hledá klíčové slovo kdekoliv v názvu (stejný přístup jako
// weightEstimate.js), ať appce sedí "Kapr obecný", "kapr šupinatý",
// "korunní kapr" i jen "kapr".
const SPECIES_CATEGORY = [
  // dravci
  { keyword: 'candát', category: 'dravec' },
  { keyword: 'sumec', category: 'dravec' },
  { keyword: 'štika', category: 'dravec' },
  { keyword: 'bolen', category: 'dravec' },
  { keyword: 'okoun', category: 'dravec' },
  { keyword: 'sumeček', category: 'dravec' },
  { keyword: 'losos', category: 'dravec' },
  { keyword: 'pstruh', category: 'dravec' },
  { keyword: 'jeseter', category: 'dravec' },
  // bílá ryba
  { keyword: 'kapr', category: 'bila' },
  { keyword: 'amur', category: 'bila' },
  { keyword: 'cejn', category: 'bila' },
  { keyword: 'lín', category: 'bila' },
  { keyword: 'plotice', category: 'bila' },
  { keyword: 'perlín', category: 'bila' },
  { keyword: 'podoustev', category: 'bila' },
  { keyword: 'jelec', category: 'bila' },
  { keyword: 'karas', category: 'bila' },
  { keyword: 'ouklej', category: 'bila' },
]

function normalize(name) {
  return (name || '').trim().toLowerCase()
}

// Appka vrací null, když druh nerozpozná -- appka pak nechá appce
// (fallback) na typu výpravy, případně na tiché ruční opravě.
export function guessCategoryFromSpecies(speciesName) {
  const n = normalize(speciesName)
  if (!n) return null
  const match = SPECIES_CATEGORY.find((s) => n.includes(s.keyword))
  return match ? match.category : null
}
