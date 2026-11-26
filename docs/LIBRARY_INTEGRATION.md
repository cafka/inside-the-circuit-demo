# Independent educational library

Reviewed public commit: `cafka/interactive-electronics-books` **3b77d06dcb899d922be0afa0cfad8d95557bd87a**. Source repository: `cafka/raspberry-pi-interactive-book`, reviewed head **e038d667017139122feba32d4e88e72d01244248**. Neither repository was edited. All 31 public JS/CSS/HTML/JSON files have matching source-tree Git blob hashes at these two commits. The public page was checked directly; it offers four Pi 5 chapters and one ESP32 chapter. This identifies the tested published version, not a claim that future source/public heads will remain equal.

`config/library.json` records the versions, compatibility and capabilities. `/library/` is a local wrapper around https://cafka.github.io/interactive-electronics-books/ . A direct external link remains available. The wrapper suspends the app camera/render loop and retains the loaded explorer object. Back restores the previous screen and URL. The two WebGL engines remain independent.

## Exact compatibility

- Raspberry Pi 5 book: LED, push button, PWM and traffic-light experiments. The book uses BCM GPIO17/27/22/23 and documented 40-pin header positions. Compatible board shortcut is only registered for Raspberry Pi 5.
- ESP32 book: ESP32-DevKitC V4 with ESP32-WROOM-32E, one door-alarm chapter. It is not the Arduino Nano ESP32 and must not inherit its pinout.
- Coral and Motor: no matching book registered; no fabricated compatibility shortcut.

Official references: [Raspberry Pi GPIO](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio), [Espressif DevKitC V4](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html). Simulation is not a wiring-safety certification of arbitrary hardware variants.

## Observed behavior

Desktop wrapper loaded the public library, opened Pi chapter 1 and executed `led.on()`. UI changed to GPIO17 HIGH, LED ON and 3.9 mA after the book's animation. Navigation back to Inside the Circuit worked. The library's current language is English; it exposes no supported theme/language handshake. The wrapper explicitly communicates this limitation rather than pretending to translate the book. Camera/photo and browser physical-touch checks remain separate from simulated circuits.

## Update procedure

1. Inspect the public repository head and source publish commits; compare chapter registry and its reachable files, not just commit timestamps.
2. Load the public URL, exercise changed chapters, check console and mobile reading controls. Verify hardware/pinout changes against official documentation.
3. Update only `config/library.json` verified commits/chapter capabilities after review. Do not copy the source into the explorer or alter the book's engine.
4. Test board-specific entry and Back while a part is selected. Do not change the selected board camera during the return.
5. If ES/EN/theme synchronization or a version-pinned public deployment is required, coordinate a supported API with the independent book project. The live iframe follows the published URL; `verifiedCommit` is an audit record, not a network pin.

The books' own code/text has no selected public licence in the reviewed README. It is linked/embedded, not redistributed or relicensed as MIT. Its vendored Three.js retains its own licence. A future offline bundle requires separate rights review.

## Additional reading check

The final attempt to open the Pi book did not expose the Read page control within 10 seconds; screenshot capture also timed out. Returning to the local home succeeded. Cause undetermined, source untouched. Reading must be checked manually before claiming full library validation. The previously observed LED simulation remains a separate successful test. See [receipt](../release/evidence/library-reading.json).

## Release v4: reproducible publication lock

The wrapper now consumes `/library-assets/3b77d06dcb899d922be0afa0cfad8d95557bd87a/index.html`, not a mutable live iframe. Run `npm run library:sync`: 36 runtime files are fetched into ignored `.local/library/<commit>`, with Git blob SHA-1 and byte-count verification. Nothing is copied into the application Git tree. Update deliberately with `node scripts/sync-library.mjs --revision <full-reviewed-commit>` and review config/lock changes. The upstream Kiro repositories are unchanged.

Fresh sync: 3,033.70 ms, 36 downloads. The pinned library and its five-chapter registry loaded in Chrome. The Pi book opened, but the animated transition again did not expose reading controls promptly; no new successful reading/simulation result is claimed. English and independent theme remain explicit limitations. The provided Coral-book screenshot represents unpublished development; Coral is absent from this pinned registry.

### Final v4 reading check

After the animated transition settled, Read page opened the complete accessible Lesson 1 text, materials and wiring; Back returned to the book. The previous 10-second timeout was not evidence of a broken reading handler. Exact transition latency was not captured. No book source was changed.
