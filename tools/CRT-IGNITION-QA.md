# CRT ignition QA

The site has one interactive startup path. `?intro=replay` opens the real powered-off CRT, with the sticky note visible and the physical power button enabled. Pressing the power button begins the ordinary audio/visual sequence; there are no frozen inspection URLs that replace or disable this state.

For local browser verification, serve the built `dist/` directory, then open `/?intro=replay`. The temporary local preview should be left on that URL when handing it to a reviewer. Check desktop, tablet, mobile portrait, and mobile landscape. Inspect the powered-off note/button first, then press the power control to observe ignition, raster, bloom, modem connection, and ready state. Reduced-motion should shorten/remove effects while retaining a usable interaction.
