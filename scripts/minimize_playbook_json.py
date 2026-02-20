#!/usr/bin/env python3
"""
Minimize playbook JSON payload size before sending to AI.

Reduces file size by:
- Keeping only fields needed for workflow documentation (title, nodes, edges, etc.)
- Truncating long text (descriptions, code) to a configurable length
- Optionally capping total output size with structural truncation (full nodes only)

Use as a pre-processing step before uploading in the app, or in a backend pipeline.

Usage:
  python scripts/minimize_playbook_json.py playbook.json -o playbook.min.json
  python scripts/minimize_playbook_json.py playbook.json --max-chars 30000 -o out.json
  python scripts/minimize_playbook_json.py dir/ -o out/   # all .json in dir
"""

import argparse
import json
import sys
from pathlib import Path


# Default limits (match or go beyond app's behavior for smaller payloads)
DEFAULT_DESCRIPTION_MAX = 500
DEFAULT_CODE_MAX = 150
MAX_FILE_CONTENT_LENGTH = 50_000


def truncate(s: str, max_len: int) -> str:
    if not s or len(s) <= max_len:
        return s
    return s[: max_len - 3].rstrip() + "..."


def minimize_node(node_data: dict, description_max: int, code_max: int) -> dict:
    min_node = {
        "internal_id": node_data.get("internal_id"),
        "type": node_data.get("type"),
        "title": node_data.get("title"),
        "sub_type": node_data.get("sub_type"),
    }
    if node_data.get("description"):
        min_node["description"] = truncate(node_data["description"], description_max)

    if node_data.get("actions"):
        min_node["actions"] = []
        for action in node_data["actions"]:
            min_action = {
                "action_type": action.get("action_type"),
                "action": action.get("action"),
            }
            if action.get("playbook"):
                min_action["playbook"] = action["playbook"]
            if action.get("playbook_data"):
                min_action["playbook_data"] = action["playbook_data"]
            if action.get("action_data", {}).get("action_title"):
                min_action["action_title"] = action["action_data"]["action_title"]
            if action.get("action_data", {}).get("app_title"):
                min_action["app_title"] = action["action_data"]["app_title"]
            if action.get("parameter_data_source"):
                min_action["parameter_data_source"] = action["parameter_data_source"]
            if action.get("code"):
                min_action["code_summary"] = truncate(action["code"], code_max)
            min_node["actions"].append(min_action)

    if node_data.get("conditions"):
        min_node["conditions"] = [
            {"label": c.get("label"), "condition_type": c.get("condition_type")}
            for c in node_data["conditions"]
        ]
    if node_data.get("memory_params"):
        min_node["memory_params"] = node_data["memory_params"]

    return min_node


def minimize_playbook(
    data: dict,
    description_max: int = DEFAULT_DESCRIPTION_MAX,
    code_max: int = DEFAULT_CODE_MAX,
) -> dict:
    out = {}
    if data.get("title"):
        out["title"] = data["title"]
    if data.get("start_node"):
        out["start_node"] = data["start_node"]
    if data.get("type"):
        out["type"] = data["type"]
    if data.get("status"):
        out["status"] = data["status"]
    if data.get("description"):
        out["description"] = truncate(data["description"], description_max)

    if data.get("nodes"):
        out["nodes"] = {
            nid: minimize_node(node, description_max, code_max)
            for nid, node in data["nodes"].items()
        }
    if data.get("edges"):
        out["edges"] = [
            {
                "source_node": e.get("source_node"),
                "destination_node": e.get("destination_node"),
                "label": e.get("label"),
            }
            for e in data["edges"]
        ]
    if data.get("output_params"):
        out["output_params"] = data["output_params"]
    if data.get("tags"):
        out["tags"] = data["tags"]
    if data.get("labels"):
        out["labels"] = data["labels"]

    return out


def structurally_truncate(data: dict, max_chars: int) -> dict:
    """Keep as many full nodes as fit within max_chars; filter edges to those nodes."""
    s = json.dumps(data, separators=(",", ":"))
    if len(s) <= max_chars:
        return data

    node_ids = list(data.get("nodes") or {})
    if not node_ids:
        return data

    truncated = {
        "title": data.get("title"),
        "start_node": data.get("start_node"),
        "type": data.get("type"),
        "status": data.get("status"),
        "description": data.get("description"),
        "nodes": {},
        "edges": [],
    }
    if data.get("output_params"):
        truncated["output_params"] = data["output_params"]
    if data.get("tags"):
        truncated["tags"] = data["tags"]
    if data.get("labels"):
        truncated["labels"] = data["labels"]

    overhead = len(json.dumps(truncated, separators=(",", ":"))) + 100
    budget = max_chars - overhead - 50

    for nid in node_ids:
        node = data["nodes"][nid]
        truncated["nodes"][nid] = node
        current = json.dumps(truncated, separators=(",", ":"))
        if len(current) > max_chars:
            del truncated["nodes"][nid]
            break

    kept = set(truncated["nodes"])
    if data.get("edges"):
        truncated["edges"] = [
            e
            for e in data["edges"]
            if e.get("source_node") in kept and e.get("destination_node") in kept
        ]
    return truncated


def process(content: str, args: argparse.Namespace) -> str:
    data = json.loads(content)
    minimized = minimize_playbook(
        data,
        description_max=args.truncate_description,
        code_max=0 if args.no_code else args.code_chars,
    )
    if args.max_chars and args.max_chars > 0:
        minimized = structurally_truncate(minimized, args.max_chars)
    return json.dumps(minimized, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser(
        description="Minimize playbook JSON to reduce payload size before sending to AI."
    )
    ap.add_argument(
        "input",
        nargs="+",
        help="Input JSON file(s) or directory (processes all .json inside).",
    )
    ap.add_argument(
        "-o",
        "--output",
        help="Output file or directory. If not set, print to stdout (single file only).",
    )
    ap.add_argument(
        "--truncate-description",
        type=int,
        default=DEFAULT_DESCRIPTION_MAX,
        metavar="N",
        help=f"Max length for description fields (default: {DEFAULT_DESCRIPTION_MAX}).",
    )
    ap.add_argument(
        "--code-chars",
        type=int,
        default=DEFAULT_CODE_MAX,
        metavar="N",
        help=f"Max length for code summary (default: {DEFAULT_CODE_MAX}). Use 0 with --no-code.",
    )
    ap.add_argument(
        "--no-code",
        action="store_true",
        help="Drop code blocks entirely (no code summary).",
    )
    ap.add_argument(
        "--max-chars",
        type=int,
        default=None,
        metavar="N",
        help=f"Cap output size by keeping only full nodes that fit (default: no cap). e.g. {MAX_FILE_CONTENT_LENGTH}",
    )
    args = ap.parse_args()

    inputs = []
    for p in args.input:
        path = Path(p)
        if path.is_dir():
            inputs.extend(sorted(path.glob("*.json")))
        elif path.is_file():
            inputs.append(path)
        else:
            print(f"Warning: not found or not file/dir: {path}", file=sys.stderr)
            continue

    if not inputs:
        print("No input files.", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.output).resolve() if args.output else None
    if len(inputs) > 1 and out_path and not out_path.exists():
        out_path.mkdir(parents=True, exist_ok=True)

    for inp in inputs:
        try:
            content = inp.read_text(encoding="utf-8")
        except Exception as e:
            print(f"Error reading {inp}: {e}", file=sys.stderr)
            continue
        try:
            result = process(content, args)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON in {inp}: {e}", file=sys.stderr)
            continue

        if len(inputs) == 1 and not out_path:
            print(result)
            continue

        if out_path and len(inputs) == 1:
            out_file = out_path
        elif out_path:
            if not out_path.is_dir():
                out_path.mkdir(parents=True, exist_ok=True)
            out_file = out_path / (inp.stem + ".min.json")
        else:
            out_file = inp.parent / (inp.stem + ".min.json")

        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(result, encoding="utf-8")
        print(f"Wrote {len(result)} chars -> {out_file}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
