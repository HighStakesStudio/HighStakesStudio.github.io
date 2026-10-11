# Déployer le site High Stakes Studio (GitHub Pages)

Dépôt : `HighStakesStudio/HighStakesStudio.github.io` (public) → https://highstakesstudio.github.io/

| Page | URL |
|---|---|
| Accueil | https://highstakesstudio.github.io/ |
| Conglomérat | https://highstakesstudio.github.io/conglomerat/ |
| Tarifs! | https://highstakesstudio.github.io/tarifs/ |
| Nordic Resources | https://highstakesstudio.github.io/nordic/ |

Tous les chemins sont relatifs : le site marche aussi dans un dépôt de projet (ex. `jeux` → https://highstakesstudio.github.io/jeux/).

## Premier déploiement

```bash
cd /workspace/hss-site
gh repo create HighStakesStudio/HighStakesStudio.github.io --public --source=. --remote=origin --push
# Pages depuis main, racine (si pas déjà actif) :
gh api repos/HighStakesStudio/HighStakesStudio.github.io/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'
gh api repos/HighStakesStudio/HighStakesStudio.github.io/pages   # status: built
```

## Mettre à jour un jeu

```bash
cd /workspace/<jeu> && npm run build:offline        # Nordic : écrit /workspace/nordic-resources-vX.html
# mettre à jour le chemin/la version dans build.mjs si besoin, puis :
cd /workspace/hss-site && node build.mjs && node test/site-test.mjs
git add -A && git commit -m "Conglomérat v1.2.x" && git push
```

Le service worker change de cache à chaque nouveau build (empreinte du HTML) : les joueurs reçoivent la mise à jour à la prochaine ouverture en ligne. Les sauvegardes (localStorage + IndexedDB, par dossier de jeu sur le même domaine) ne sont pas touchées.

## Sur Android

Ouvrir le jeu dans Chrome → menu ⋮ → « Ajouter à l'écran d'accueil » / « Installer l'application ». Chaque jeu s'installe comme une appli distincte (manifeste et portée propres à son dossier).
