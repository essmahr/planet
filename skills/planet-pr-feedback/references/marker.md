# Marker

Restore the marker saved in step 1:

- Same epic: `planet session step <step> --phase <phase>`.
- Another epic: `planet session start <saved epic> --phase <phase> --step <step>`.
- Omit `--phase` when the saved phase is null.
- A saved `null` marker stays `pr-feedback`.
- A saved null step stays `pr-feedback` for the same epic and omits `--step` for another.
