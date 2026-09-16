# Review feedback

Run only for the request `review feedback`. No epic is opened.

The directory must be the Planet plugin repo: `grep -q '"name": "planet"' "$(git rev-parse --show-toplevel)/.claude-plugin/plugin.json"` must succeed, else say `run /planet:go review feedback from the Planet plugin repo` and stop. Run `planet session review`, then `planet feedback report` and read the `reviews:` line for the last date, and invoke `planet:planet-feedback-review` with `since: <date or none>`. On either `feedback review done` line: say it, run `planet session end`. On `feedback-review aborted: <why>`: say so, run `planet session end`.
