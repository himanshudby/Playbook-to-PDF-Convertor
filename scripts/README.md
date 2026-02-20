# Scripts

## minimize_playbook_json.py

Reduces playbook JSON size **before** you upload files in the app (or before sending to any AI). Use it when your playbooks are very large so the payload stays within context limits and the model gets valid, complete data.

**What it does:**

- Keeps only fields needed for documentation: `title`, `start_node`, `nodes`, `edges`, `type`, `status`, `description`, actions (with playbook refs), conditions, etc.
- Truncates long descriptions and code to a fixed length (configurable).
- Optionally caps total output size by keeping only as many **full nodes** as fit (`--max-chars`), so the result is always valid JSON.

**Usage (Python 3, no extra deps):**

```bash
# Single file → print minimized JSON to stdout
python scripts/minimize_playbook_json.py playbook.json

# Single file → write to output file
python scripts/minimize_playbook_json.py playbook.json -o playbook.min.json

# Aggressive: shorter descriptions, no code, cap at 30k chars
python scripts/minimize_playbook_json.py playbook.json -o out.json \
  --truncate-description 200 --no-code --max-chars 30000

# All .json files in a directory
python scripts/minimize_playbook_json.py path/to/playbooks/ -o path/to/minimized/
```

**Options:**

| Option | Description |
|--------|-------------|
| `-o, --output` | Output file (single input) or directory (multiple inputs). Omit to print to stdout (single file only). |
| `--truncate-description N` | Max length for description fields (default: 500). |
| `--code-chars N` | Max length for code summary (default: 150). |
| `--no-code` | Drop code blocks entirely. |
| `--max-chars N` | Cap output size; keeps only full nodes that fit (e.g. 50000). |

**Workflow:**

1. Run the script on your raw playbook(s).
2. Upload the **minimized** `.min.json` file(s) in the Playbook-to-PDF app.
3. The app will still apply its own minimization and chunking; starting from already-reduced JSON helps avoid truncation and improves AI output.
