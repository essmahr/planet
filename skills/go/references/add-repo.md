# Add repo

Run for the request `add repo <owner/name>` once step 3 has opened the epic.
An epic often starts in one repo and grows into another, such as a backend
repo joining a frontend epic.

1. `planet epic repo add <slug> <owner/name>`.
2. `planet repo path <owner/name>`. When it exits 3, ask for the checkout's
   path in chat, then run `planet repo seen --path <dir>`.
3. Say the repo was added. Ask with AskUserQuestion: `Add phases in it`,
   `Stop`. Add phases dispatches phasing per step 7 with
   `reason: add: phases in <owner/name>`.
