# AZERTY Coach

Serveur MCP en lecture seule : taper n'importe quel caractère sur un clavier français, et apprendre l'AZERTY quand on vient d'un autre clavier. Sans compte, sans authentification, aucune donnée conservée. Un clavier visuel (MCP Apps) accompagne les réponses dans les hôtes qui l'affichent ; le texte des réponses suffit seul.

Point MCP public (Streamable HTTP, sans état) : `https://mcp.azerty.global/mcp`. Un Worker Cloudflare le sert (`wrangler.jsonc`).

## Outils

Cinq outils, tous en lecture seule (`readOnlyHint` vrai, `destructiveHint` et `openWorldHint` faux), avec un titre. Descriptions en anglais pour le modèle ; réponses en français (vouvoiement) ou en anglais selon `language`.

| Outil | Rôle |
|---|---|
| `find_character` | un caractère, son point de code, son nom ou une description → les touches en clair, le code Alt Windows, le caractère à copier |
| `how_to_type` | un texte court (2 000 caractères au plus) → une fiche par caractère distinct hors lettres simples, chiffres et blancs ; une réponse partielle le dit |
| `get_lessons` | les 7 modules et 31 leçons d'AZERTY Global, avec leurs 69 exercices, et le parcours `expat` (bases communes à tous les AZERTY) pour qui vient d'un autre clavier |
| `check_exercise` | compare la frappe à l'exercice, caractère par caractère |
| `compare_layouts` | pour qui change de clavier : les caractères dont la frappe change, du plus fréquent au plus rare, puis le premier exercice |

Dispositions : AZERTY Windows, AFNOR, macOS (relevé OS X 10.9, avec réserve), Linux, belge ; QWERTY US, UK, espagnol, italien, portugais ; QWERTZ allemand, suisse ; et AZERTY Global. Aucune frappe n'est inventée : une disposition inconnue se demande.

## Utiliser le serveur

- **Claude** : Customize › Connectors › ajouter un connecteur personnalisé, URL `https://mcp.azerty.global/mcp` (sans barre finale).
- **Codex** : dans `~/.codex/config.toml` :

  ```toml
  [mcp_servers.azerty-coach]
  url = "https://mcp.azerty.global/mcp"
  ```

- **ChatGPT** : l'annuaire des plugins (partagé avec Codex), après publication ; le dépôt ne documente pas d'installation manuelle.

### Une adresse par hôte

Claude et ChatGPT lisent la même clé `_meta.ui.domain` de la ressource du clavier, avec des formats incompatibles : un hachage `….claudemcpcontent.com` pour Claude (qui refuse de rendre l'appli si la valeur ne correspond pas à l'URL exacte configurée), une origine `https://…` pour ChatGPT. Le serveur est sans état et ne reconnaît pas l'hôte à la lecture de la ressource : l'adresse choisit le profil (`src/mcp/hosts.ts`).

| Adresse | `ui.domain` | Pour |
|---|---|---|
| `/mcp` | aucun (bac à sable par défaut de l'hôte) | tout hôte, Codex, essais |
| `/mcp/openai` | `https://mcp.azerty.global` | annuaire ChatGPT et Codex |
| `/mcp/claude` | `384eeba0eae24b199fbe84feef8fc7aa.claudemcpcontent.com` | Claude, si un domaine stable est voulu |

`/mcp/` et `/mcp/openai/` répondent comme sans barre finale ; `/mcp/claude/` répond 404, parce que le hachage de Claude vise l'URL exacte. Le serveur ne demande aucun domaine à Claude pour fonctionner : il n'en faut un que pour une appli qui lance son propre OAuth.

### Vérification de domaine d'OpenAI

`GET /.well-known/openai-apps-challenge` renvoie, en texte brut et sans retour à la ligne, le jeton du secret `OPENAI_APPS_CHALLENGE` du Worker ; 404 tant que ce secret n'existe pas. Le jeton n'est connu qu'à l'ouverture du dossier dans le portail OpenAI : `wrangler secret put OPENAI_APPS_CHALLENGE`.

## Données

`data/*.json` vient de la branche `main` du site (`tester/character-index.json`, `tester/lessons.json`, `tester/azerty-global.json`, `data/AZERTY Traditionnel.json` pour le nom des touches). Le module « course aux 30 millions » est retiré.

```powershell
npm run data
```

La source doit être exactement sur `origin/main` (`scripts/site-source.ts`, référence locale, sans `git fetch`). Par défaut le worktree voisin `../website` ; `COACH_REFONTE` en désigne un autre (un clone frais convient). `npm run data:check` signale des données périmées sans rien écrire.

## Widget clavier

`find_character`, `how_to_type`, `check_exercise` et `compare_layouts` s'affichent avec un clavier visuel (MCP Apps, ressource `ui://azerty-coach/keyboard-<empreinte>.html`) : le clavier du testeur du site, les touches du caractère entourées, une étape par touche pour une touche morte, et une zone d'essai. Gabarit : `widget/keyboard.html`. L'iframe de l'hôte bloque toute ressource externe : `npm run widget` y inline `tester/keyboard.js` et ses modules, `tester/keyboard.css`, les polices du site, le pont `@modelcontextprotocol/ext-apps` et la disposition, et écrit `data/widget.json`. `npm run widget:check` signale un widget périmé (même source que les données).

La politique de sécurité du widget (CSP) est vide, sans domaine autorisé, déclarée sous `_meta.ui.csp` (MCP Apps) et `openai/widgetCSP` (ChatGPT).

## Commandes

```powershell
npm install
npm run check
npm run mcp
npm run deploy:dry
```

`npm run check` lance le typage et les tests (dont l'instantané de la surface publique : `UPDATE_SNAPSHOT=1 npm test` le met à jour, à relire au diff) ; `npm run mcp` sert le serveur en stdio (sans `ui.domain`) ; `npm run deploy:dry` construit le Worker sans le déployer. Retour arrière d'un déploiement : `wrangler rollback <version-id>`.

`server.json` décrit le serveur pour le registre MCP officiel (remote Streamable HTTP). Publier dans ce registre est définitif : une version publiée ne se retire pas.

## Licence

EUPL 1.2, comme AZERTY Global. Les tables de frappes de `sources/` viennent de xkeyboard-config, de CLDR (Unicode) et des dispositions Windows ; leurs attributions détaillées restent à consigner dans un fichier NOTICE.
