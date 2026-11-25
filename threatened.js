// Threatened bird species to highlight on the dashboard.
// Statuses checked 2026-11-25 against:
//   FFG Act (Vic): DEECA "FFG Threatened List July 2026"
//     https://www.environment.vic.gov.au/conserving-threatened-species/threatened-list
//   EPBC Act (national): DCCEEW threatened fauna list, via the ALA mirror (dr656)
//     https://lists.ala.org.au/speciesListItemView/dr656
//
// Detections are matched on genus + species of `sci` (BirdNET reports species, so a
// subspecies listing such as Brown Treecreeper victoriae matches every Brown Treecreeper),
// then on `common` / `aka` names. Leave ffg or epbc empty ('') when not listed under that Act.
// After editing, commit and push to update the live dashboard.

export const THREATENED_SPECIES = [
    // Woodland birds
    { common: 'Speckled Warbler',           sci: 'Pyrrholaemus sagittatus',          ffg: 'Endangered',            epbc: '' },
    { common: 'Diamond Firetail',           sci: 'Stagonopleura guttata',            ffg: 'Vulnerable',            epbc: 'Vulnerable' },
    { common: 'Brown Treecreeper',          sci: 'Climacteris picumnus victoriae',   ffg: 'Vulnerable',            epbc: 'Vulnerable',  note: 'south-eastern subspecies' },
    { common: 'Hooded Robin',               sci: 'Melanodryas cucullata cucullata',  ffg: 'Endangered',            epbc: 'Endangered',  note: 'south-eastern subspecies' },
    { common: 'Grey-crowned Babbler',       sci: 'Pomatostomus temporalis',          ffg: 'Vulnerable',            epbc: '',            aka: ['Gray-crowned Babbler'] },
    { common: 'Painted Honeyeater',         sci: 'Grantiella picta',                 ffg: 'Vulnerable',            epbc: 'Vulnerable' },
    { common: 'Southern Whiteface',         sci: 'Aphelocephala leucopsis',          ffg: 'Vulnerable',            epbc: 'Vulnerable' },
    { common: 'Chestnut-rumped Heathwren',  sci: 'Calamanthus pyrrhopygius',         ffg: 'Vulnerable',            epbc: '' },
    { common: 'Swift Parrot',               sci: 'Lathamus discolor',                ffg: 'Critically Endangered', epbc: 'Critically Endangered' },
    { common: 'Regent Honeyeater',          sci: 'Anthochaera phrygia',              ffg: 'Critically Endangered', epbc: 'Critically Endangered' },
    { common: 'Gang-gang Cockatoo',         sci: 'Callocephalon fimbriatum',         ffg: 'Endangered',            epbc: 'Endangered' },
    { common: 'Red-tailed Black-Cockatoo',  sci: 'Calyptorhynchus banksii graptogyne', ffg: 'Endangered',          epbc: 'Endangered',  note: 'south-eastern subspecies' },
    { common: 'Malleefowl',                 sci: 'Leipoa ocellata',                  ffg: 'Vulnerable',            epbc: 'Vulnerable' },
    { common: 'Bush Stone-curlew',          sci: 'Burhinus grallarius',              ffg: 'Critically Endangered', epbc: '',            aka: ['Bush Thick-knee'] },
    { common: 'White-throated Needletail',  sci: 'Hirundapus caudacutus',            ffg: 'Vulnerable',            epbc: 'Vulnerable' },
    { common: 'Crested Bellbird',           sci: 'Oreoica gutturalis',               ffg: 'Endangered',            epbc: '' },
    { common: 'Apostlebird',                sci: 'Struthidea cinerea',               ffg: 'Vulnerable',            epbc: '' },

    // Owls and raptors
    { common: 'Powerful Owl',               sci: 'Ninox strenua',                    ffg: 'Vulnerable',            epbc: '' },
    { common: 'Barking Owl',                sci: 'Ninox connivens',                  ffg: 'Critically Endangered', epbc: '' },
    { common: 'Masked Owl',                 sci: 'Tyto novaehollandiae',             ffg: 'Critically Endangered', epbc: '',            aka: ['Australian Masked-Owl'] },
    { common: 'Square-tailed Kite',         sci: 'Lophoictinia isura',               ffg: 'Vulnerable',            epbc: '' },
    { common: 'Little Eagle',               sci: 'Hieraaetus morphnoides',           ffg: 'Vulnerable',            epbc: '' },
    { common: 'Grey Goshawk',               sci: 'Accipiter novaehollandiae',        ffg: 'Endangered',            epbc: '',            aka: ['Gray Goshawk'] },
    { common: 'Black Falcon',               sci: 'Falco subniger',                   ffg: 'Critically Endangered', epbc: '' },
    { common: 'White-bellied Sea-Eagle',    sci: 'Haliaeetus leucogaster',           ffg: 'Endangered',            epbc: '' },

    // Wetland birds
    { common: 'Brolga',                     sci: 'Antigone rubicunda',               ffg: 'Endangered',            epbc: '' },
    { common: 'Australasian Bittern',       sci: 'Botaurus poiciloptilus',           ffg: 'Critically Endangered', epbc: 'Endangered' },
    { common: "Latham's Snipe",             sci: 'Gallinago hardwickii',             ffg: 'Vulnerable',            epbc: 'Vulnerable' },
    { common: 'Australian Painted-snipe',   sci: 'Rostratula australis',             ffg: 'Critically Endangered', epbc: 'Endangered',  aka: ['Australian Painted Snipe'] },
    { common: 'Blue-billed Duck',           sci: 'Oxyura australis',                 ffg: 'Vulnerable',            epbc: '' },
    { common: 'Freckled Duck',              sci: 'Stictonetta naevosa',              ffg: 'Endangered',            epbc: '' },
    { common: 'Musk Duck',                  sci: 'Biziura lobata',                   ffg: 'Vulnerable',            epbc: '' },
    { common: 'Australasian Shoveler',      sci: 'Spatula rhynchotis',               ffg: 'Vulnerable',            epbc: '' },
    { common: "Lewin's Rail",               sci: 'Lewinia pectoralis',               ffg: 'Vulnerable',            epbc: '' },
    { common: 'Little Egret',               sci: 'Egretta garzetta nigripes',        ffg: 'Endangered',            epbc: '',            note: 'Australian subspecies' },
    { common: 'Magpie Goose',               sci: 'Anseranas semipalmata',            ffg: 'Vulnerable',            epbc: '' },
];
