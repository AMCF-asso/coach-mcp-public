// Parcours pour expatriés : la base commune des AZERTY (cadrage, étape 6) — A et Q, Z et W, M ; les chiffres
// en Maj ; les accents directs ; les touches mortes ^ et ¨ ; la ponctuation. Rien n'y dépend d'AZERTY Global :
// chaque exercice se tape sur l'AZERTY de Windows, de macOS, de Linux, belge et AFNOR (test/core.test.ts).
// AZERTY Global n'est proposé qu'à la fin du parcours (lessons.ts, `EXPAT_NEXT`).
import type { Module } from "./data.ts";

const NNBSP = " "; // espace fine insécable, avant ; ! ?
const NBSP = " "; // espace insécable, avant :

export const EXPAT_MODULES: Module[] = [
  {
    id: "bases-azerty",
    title: "Les bases de l'AZERTY",
    titleEn: "AZERTY basics",
    description: "Ce qui change quand on passe d'un QWERTY ou d'un QWERTZ à n'importe quel AZERTY.",
    descriptionEn: "What changes when you move from a QWERTY or QWERTZ keyboard to any AZERTY keyboard.",
    lessons: [
      {
        id: "lettres",
        title: "A et Q, Z et W, M",
        titleEn: "A and Q, Z and W, M",
        description: "Le A prend la place du Q, le Z celle du W, et le M passe à droite du L.",
        descriptionEn: "A takes the place of Q, Z the place of W, and M moves to the right of L.",
        characters: ["a", "q", "z", "w", "m"],
        exercises: [
          {
            type: "words",
            instruction: "Tapez ces mots.",
            instructionEn: "Type these words.",
            content: "quoi quand quatre\nazur zone zoom\nmaman mardi mot",
          },
          {
            type: "sentence",
            instruction: "Tapez cette phrase.",
            instructionEn: "Type this sentence.",
            content: "Quinze wagons arrivent au quai de Marseille",
          },
        ],
      },
      {
        id: "chiffres",
        title: "Les chiffres en Maj",
        titleEn: "Digits with Shift",
        description: "Sur la rangée du haut, les chiffres demandent Maj ; sans Maj, ces touches donnent des lettres accentuées et des signes.",
        descriptionEn: "On the top row, digits need Shift; without it, these keys type accented letters and symbols.",
        characters: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        exercises: [
          {
            type: "numbers",
            instruction: "Tapez ces nombres.",
            instructionEn: "Type these numbers.",
            content: "12 15 30 45 2026\n75005 13008 69001",
          },
          {
            type: "sentence",
            instruction: "Tapez cette adresse.",
            instructionEn: "Type this address.",
            content: "18 rue de la Paix 75002 Paris",
          },
        ],
      },
      {
        id: "accents",
        title: "é, è, à, ç et ù",
        titleEn: "é, è, à, ç and ù",
        description: "é, è et à ont leur propre touche sur tous les AZERTY ; ç et ù aussi, sauf sur l'AZERTY AFNOR, où ils passent par AltGr.",
        descriptionEn: "é, è and à have their own key on every AZERTY; so do ç and ù, except on the AFNOR AZERTY, where they need AltGr.",
        characters: ["é", "è", "à", "ç", "ù"],
        exercises: [
          {
            type: "words",
            instruction: "Tapez ces mots.",
            instructionEn: "Type these words.",
            content: "été déjà voilà\nça leçon garçon\noù très après",
          },
          {
            type: "sentence",
            instruction: "Tapez cette phrase.",
            instructionEn: "Type this sentence.",
            content: "Voilà un été très chaud où le garçon a déjà mangé sa glace",
          },
        ],
      },
      {
        id: "circonflexe-trema",
        title: "L'accent circonflexe et le tréma",
        titleEn: "Circumflex and diaeresis",
        description: "L'accent circonflexe et le tréma passent le plus souvent par une touche morte : elle ne tape rien seule et attend la lettre suivante.",
        descriptionEn: "The circumflex and the diaeresis usually go through a dead key: it types nothing on its own and waits for the next letter.",
        characters: ["ê", "â", "î", "ô", "û", "ë", "ï"],
        exercises: [
          {
            type: "words",
            instruction: "Tapez ces mots.",
            instructionEn: "Type these words.",
            content: "être fête forêt\nâge île hôtel sûr\nNoël maïs naïf",
          },
          {
            type: "sentence",
            instruction: "Tapez cette phrase.",
            instructionEn: "Type this sentence.",
            content: "Le maître a goûté la crème brûlée à l'hôtel",
          },
        ],
      },
      {
        id: "ponctuation",
        title: "La ponctuation",
        titleEn: "Punctuation",
        description: "La ponctuation change de place par rapport au QWERTY : sur la plupart des AZERTY, le point se tape avec Maj. La frappe de chaque signe est indiquée pour votre clavier.",
        descriptionEn: "Punctuation moves compared with QWERTY: on most AZERTY keyboards, the period needs Shift. Each sign is shown for your keyboard.",
        characters: [",", ".", ";", ":", "!", "?"],
        exercises: [
          {
            type: "sentence",
            instruction: "Tapez ces lignes. Une espace simple avant ; : ! ? est acceptée.",
            instructionEn: "Type these lines. A plain space before ; : ! ? is accepted.",
            content: `Bonjour, comment allez-vous${NNBSP}?\nTrès bien${NNBSP}; merci${NNBSP}!\nNote${NBSP}: rendez-vous à 9 h.`,
          },
        ],
      },
    ],
  },
];
