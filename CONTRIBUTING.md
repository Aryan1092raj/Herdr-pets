# Contributing to herdr-pets

Thanks for taking a look. herdr-pets gives every running coding agent a pixel pet, and the pets live in a strip at the bottom of the Herdr window. Bug reports, new sprites and ideas are all welcome.

## Ways to help

There are four good ways to help.

- Report bugs. Describe what you saw, what you expected and your Herdr version.
- Draw new sprites. See [Adding a pet](#adding-a-pet).
- Suggest behavior. Tell us how the pets should act and why that helps.
- Improve the docs. Fix a typo or make a step clearer.

## Set up

Clone the repository, go into it and copy the mod into the app:

```sh
git clone https://github.com/Aryan1092raj/Herdr-pets
cd Herdr-pets
cp -r mods/herdr-pets ~/.config/herdr-app/mods/
```

The app reloads a mod when its files are saved, so copy the folder again after each change and the app picks it up. Read `~/.config/herdr-app/AGENTS.md` to learn how mods work. The `gpui-kit.d.ts` and `herdr.d.ts` files next to it list the API the mod can call.

## Project layout

The mod lives in `mods/herdr-pets`:

- `main.js` draws the strip and the pets.
- `pets.js` holds the placement, roaming, throw and dialogue logic.
- `*.svg` are the sprites, and `mod.json` describes the mod to the app.
- `test/pets.test.mjs` holds the tests, which use `node:test`.

At the repository root, `README.md`, `RECIPE.md` and `preview.png` describe and show the mod.

## Before you open a pull request

All four checks must pass first.

- `node --test test/pets.test.mjs` on Node 18 or newer
- `herdr-app check ~/.config/herdr-app/mods/herdr-pets`
- `herdr-app status` shows no errors
- `herdr-app shot pets.png`, then open the image and look at the strip

CI runs the test file and checks that every sprite and `mod.json` parse.

## Code guidelines

- Put logic that can be tested in `pets.js` and cover it with a test. `pets.js` has no imports, so Node can load it on its own.
- Keep `main.js` to drawing. It reads state and draws it.
- Animate with `loop`, `transition` and `frames`. Do not add redraw timers. The only timer is the 3 second beat.
- Use `theme()` for colors, so the pets follow the app theme.
- Keep the folder name `herdr-pets` in sync with the `MOD` constant in `main.js`.

## Adding a pet

A sprite is a one-color SVG on a 16x16 or 24x24 viewBox. Use `currentColor` or a single fill, because the app tints the sprite with the status color. Leave the eye holes transparent and put the feet on the bottom edge. Share only art you made or have the right to share.

Generic pets go in `KINDS` in `pets.js`. A pet for one agent app goes in `APP_KINDS` in `pets.js` as a regular expression on the app name, such as `[/^myapp/, "myapp"]`. Add an assert for the new entry to the `kindFor` test, and name the SVG after its kind, so `myapp.svg` goes with `"myapp"`.

## Keep RECIPE.md current

`RECIPE.md` is the brief that herdr.dev/mods uses to rebuild the mod. Whenever behavior changes, update it in the same pull request. Otherwise the rebuilt mod drifts from the code.

## Pull requests

- Keep each pull request small and focused on one change.
- Write short, imperative commit messages, such as `Add cat sprite` or `Fix beat timing`.
- Describe what you changed and how you checked it.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before you take part.
