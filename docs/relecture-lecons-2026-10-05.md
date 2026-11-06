# Relecture des leçons contre l'index des caractères (2026-10-05)

Source : `tester/lessons.json` (généré le 2026-01-06) et `tester/character-index.json` (généré le 2026-09-25), branche `refonte` à `5fda278`. Module « course aux 30 millions » exclu : 7 modules, 31 leçons, 70 exercices.

## Ce qui est juste

- Les 70 exercices ne contiennent que des caractères présents dans l'index. Chaque caractère annoncé par une leçon apparaît dans au moins un exercice.
- Les cinq `hintMethod` (É, È, Ç, À par la touche morte circonflexe ; ù par la touche morte aiguë suivie de V) correspondent à une méthode de l'index.
- Les espaces de la leçon « Espaces insécables » sont bien placées : espace fine avant ; ! ? et dans « », espace insécable avant : et dans « 15 h ».
- Les frappes annoncées pour %, ù, Ù, ‑, ~, `, ß et les ligatures concordent avec l'index.

## Écarts et décisions (QCM d'Antoine, 2026-10-05)

Les corrections vivent dans une surcouche du coach (`CORRECTIONS` de `scripts/build-data.ts`) : le site et le testeur gardent leur texte. Chaque correction remplace un passage exact ; si la source change, `npm run data` échoue.

| # | Leçon | Texte du site | Constat | Décision dans le coach |
|---|---|---|---|---|
| 1 | `email-web/point-virgule` | « Le point-virgule est maintenant sur Maj + , » (EN « Shift + , ») | **Faux.** Dans AZERTY Global, ; est en Maj sur la touche gravée ; (celle du point). Maj + , donne « ? ». | « Le point-virgule passe sur Maj + ; (la touche du point) ». **À corriger aussi sur le site**, dans une session du site. |
| 2 | `typographie-francaise/apostrophe-typographique` | titre « Apostrophe typographique ' » | Le titre montre l'apostrophe droite. | « Apostrophe typographique ’ » |
| 3 | `email-web/croisillon`, `langues-etrangeres/latin-etendu` | « Maj + @ », « AltGr + - (touche 6) » | Nommage d'avant la règle du 2026-09-29 : une touche se nomme par sa gravure physique ou par son chiffre. | Règle du site : « Maj + ² », « AltGr + 6 » (descriptions et consigne) |
| 4 | exercices hors du module Typographie | « L'ÉCOLE ! », « OÙ ? », « C'est » | Apostrophe droite et espace simple avant ! et ?. | Accepter les deux : hors de `typographie-francaise`, `check_exercise` tient ' et ’, l'espace simple, fine ou insécable pour équivalentes. Guillemets et accents restent vérifiés. |
| 5 | `symboles-specialises/monetaires` | « 100£ », « 99¢ », « 0,5₿ » | Pas d'espace avant le symbole, contraire à l'usage français (100 £). | Espace insécable entre montant et symbole, pour les sept montants |
| 6 | `langues-etrangeres/latin-etendu`, exercice 2 | « e → ɛ » | Fait taper → (touche morte des symboles divers), enseigné seulement dans le dernier module. | « e ɛ », « n ŋ », « z ʒ », sans flèche |

## Côté AZERTY Coach, corrigé dans le code

- Le marqueur `{ALTGR}` des consignes (remplacé par le testeur selon le système) sort en « AltGr ».
- Une touche de chiffre seule garde sa lettre : « touche ^, puis touche é » et non « touche 2 ».
