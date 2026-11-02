# Sprite packs

A sprite pack is a folder of SVG pets that HERDR-PETS can offer in a pet's right-click menu. Packs also cover your own sprites: put them in a pack called `custom`.

## Make a pack

1. Make a folder `mods/herdr-pets/packs/<pack>/` and put one SVG per pet in it, named `<sprite>.svg`. Use letters, digits, `_` and `-` only.
2. Draw each sprite on a square grid (16 by 16 works well) with `fill="currentColor"`, so the pet takes its status or theme color. Look at `mods/herdr-pets/blob.svg` for the shape.
3. List the pack in `mods/herdr-pets/packs/index.json`:

```json
{ "packs": { "custom": ["dragon", "slime"] } }
```

That adds the sprites `custom/dragon` and `custom/slime` to the sprite row of the pet menu. Pack sprites do not blink, because the lids need eye positions that only built-in sprites define.

## Share a pack

Open a pull request that adds `mods/herdr-pets/packs/<pack>/` and its entry in `packs/index.json`. Packs are plain files in the repo, so the mod never downloads anything.
