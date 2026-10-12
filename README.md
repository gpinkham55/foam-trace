# Foam Tracer

A browser app that turns a backlit photo of hand tools on a 5 mm grid into an SVG for waterjet-cutting foam inserts. Everything runs in the browser; photos never leave your device.

## Using it

1. **Photo.** Lay the tools on the grid over a light panel, turn the room lights off and shoot from straight above. Shooting from higher up with some zoom reduces lens distortion. Keep a clear block of grid visible.
2. **Calibrate.** Tap the 4 corners of a rectangle of grid squares and enter how many squares across and down it spans. Cyan lines are drawn over the photo; they should sit on the printed grid. Drag a corner to fine-tune.
3. **Trace & edit.**
   - *Detection:* the automatic threshold usually works. "Grid line removal" strips the printed lines; "Ignore blobs under" drops specks.
   - *Pockets:* clearance is the gap between tool and foam. Smoothing rounds off inside corners and notches; it only ever adds room, never cuts into the clearance.
   - *Tools:* tap a pocket to select it, drag points, tap the outline to add a point, Delete/Backspace removes a point or tool. Detection settings lock once you edit; unlock to start over.
   - *Foam boundary:* auto-fits around the pockets with a margin, or type a size and position.
4. **Download SVG.**

## The SVG

- Units are millimetres (`width="…mm"`, 1 user unit = 1 mm).
- Two layers (Inkscape-style groups): `pockets` (red, one closed path per tool; overlapping pockets are merged) and `boundary` (blue rectangle). Hide or delete the boundary layer for outlines only.
- Clearance is built in. **Kerf compensation is not**; set it in your waterjet CAM.

## Accuracy

Perspective is corrected from the 4 calibration corners. Lens distortion is not, so error grows towards the photo edges. Check a tool against its measured size in the panel (select it to see "Tool W × H mm") before cutting.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit and end-to-end pipeline tests
npm run build    # production build into dist/
```

Pushing to `main` runs the tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`. In the repo settings, set **Pages → Source** to **GitHub Actions** once.

Code layout:

- `src/core/` image processing and geometry, no DOM: calibration and homography, warp to a top-down mm image, threshold and grid-line removal, contour tracing (`d3-contour`), offsets and unions (`clipper-lib`), SVG export.
- `src/ui/` pan/zoom SVG viewer and image I/O.
- `src/main.ts` app state and wiring.
