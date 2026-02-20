export const readFilesAsText = async (files: File[]): Promise<{ name: string; content: string }[]> => {
  const promises = files.map((file) => {
    return new Promise<{ name: string; content: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          resolve({
            name: file.name,
            content: content
          });
        } else {
          reject(new Error(`Failed to read file: ${file.name}`));
        }
      };
      reader.onerror = () => reject(new Error(`Error reading file: ${file.name}`));
      reader.readAsText(file);
    });
  });

  return Promise.all(promises);
};

const MAX_DESCRIPTION_LENGTH = 300;
const MAX_CODE_SUMMARY_LENGTH = 80;

export type ExtractedPlaybook = { name: string; content: string; parentName?: string };

/**
 * Extracts the main playbook and all embedded sub-playbooks (from action.playbook_data).
 * Returns parent first, then each sub-playbook once (deduped by title), so the AI can document all.
 */
export function extractPlaybooksFromFile(fileContent: string): ExtractedPlaybook[] {
  const result: ExtractedPlaybook[] = [];
  const seenTitles = new Set<string>();

  function addPlaybook(parsed: any, parentName?: string) {
    const title = parsed?.title || parsed?.name || "Playbook";
    if (seenTitles.has(title)) return;
    seenTitles.add(title);
    result.push({
      name: title,
      content: JSON.stringify(parsed),
      parentName,
    });
  }

  function collectEmbedded(parsed: any, parentName: string) {
    const nodes = parsed?.nodes;
    if (!nodes || typeof nodes !== "object") return;
    for (const node of Object.values(nodes) as any[]) {
      const actions = node?.actions;
      if (!Array.isArray(actions)) continue;
      for (const action of actions) {
        const pd = action?.playbook_data;
        if (!pd || typeof pd !== "object") continue;
        if (pd.nodes && typeof pd.nodes === "object") {
          const subTitle = pd.title || pd.name || "Sub-playbook";
          addPlaybook(pd, parentName);
          collectEmbedded(pd, subTitle);
        }
      }
    }
  }

  try {
    const parsed = JSON.parse(fileContent);
    const mainTitle = parsed?.title || parsed?.name || "Playbook";
    addPlaybook(parsed);
    collectEmbedded(parsed, mainTitle);
    return result;
  } catch {
    return [{ name: "Playbook", content: fileContent }];
  }
}

/**
 * Minimizes JSON playbook content by removing unnecessary fields while preserving
 * essential workflow structure information needed for AI analysis.
 * Keeps payload small for large playbooks (truncates descriptions, code, and nested blobs).
 */
export const minimizePlaybookJSON = (jsonContent: string): string => {
  try {
    const parsed = JSON.parse(jsonContent);
    const minimized: any = {};

    // Keep essential top-level fields
    if (parsed.title) minimized.title = parsed.title;
    if (parsed.start_node) minimized.start_node = parsed.start_node;
    if (parsed.type) minimized.type = parsed.type;
    if (parsed.status) minimized.status = parsed.status;
    if (parsed.description) {
      minimized.description =
        parsed.description.length <= MAX_DESCRIPTION_LENGTH
          ? parsed.description
          : parsed.description.substring(0, MAX_DESCRIPTION_LENGTH - 3) + "...";
    }

    // Minimize nodes - keep only essential information
    if (parsed.nodes) {
      minimized.nodes = {};
      for (const [nodeId, node] of Object.entries(parsed.nodes)) {
        const nodeData: any = node;
        const minNode: any = {
          internal_id: nodeData.internal_id,
          type: nodeData.type,
          title: nodeData.title,
          sub_type: nodeData.sub_type,
        };

        if (nodeData.description) {
          minNode.description =
            nodeData.description.length <= MAX_DESCRIPTION_LENGTH
              ? nodeData.description
              : nodeData.description.substring(0, MAX_DESCRIPTION_LENGTH - 3) + "...";
        }

        // Minimize actions - keep only essential fields, shrink nested blobs
        if (nodeData.actions && Array.isArray(nodeData.actions)) {
          minNode.actions = nodeData.actions.map((action: any) => {
            const minAction: any = {
              action_type: action.action_type,
              action: action.action,
            };

            if (action.playbook) minAction.playbook = action.playbook;
            // Keep only title from playbook_data to avoid huge embedded playbooks
            if (action.playbook_data) {
              const pd = action.playbook_data;
              minAction.playbook_data =
                typeof pd === "object" && pd !== null && (pd.title || pd.name)
                  ? { title: pd.title ?? pd.name }
                  : pd;
            }

            if (action.action_data?.action_title) {
              minAction.action_title = action.action_data.action_title;
            }
            if (action.action_data?.app_title) {
              minAction.app_title = action.action_data.app_title;
            }
            if (action.parameter_data_source && typeof action.parameter_data_source === "object") {
              minAction.parameter_keys = Object.keys(action.parameter_data_source);
            }

            if (action.code) {
              minAction.code_summary =
                action.code.substring(0, MAX_CODE_SUMMARY_LENGTH) +
                (action.code.length > MAX_CODE_SUMMARY_LENGTH ? "..." : "");
            }

            return minAction;
          });
        }

        // Keep conditions but simplified
        if (nodeData.conditions && Array.isArray(nodeData.conditions)) {
          minNode.conditions = nodeData.conditions.map((condition: any) => ({
            label: condition.label,
            condition_type: condition.condition_type,
          }));
        }

        // Keep memory params if they exist
        if (nodeData.memory_params && Object.keys(nodeData.memory_params).length > 0) {
          minNode.memory_params = nodeData.memory_params;
        }

        minimized.nodes[nodeId] = minNode;
      }
    }

    // Minimize edges - keep only essential connection information
    if (parsed.edges) {
      minimized.edges = parsed.edges.map((edge: any) => ({
        source_node: edge.source_node,
        destination_node: edge.destination_node,
        label: edge.label,
      }));
    }

    // Keep output params if they exist
    if (parsed.output_params) minimized.output_params = parsed.output_params;

    // Keep tags and labels if they exist (useful for categorization)
    if (parsed.tags) minimized.tags = parsed.tags;
    if (parsed.labels) minimized.labels = parsed.labels;

    return JSON.stringify(minimized);
  } catch (error) {
    console.warn('Failed to minimize JSON, returning original:', error);
    // If parsing fails, return original content
    return jsonContent;
  }
};

/**
 * Converts playbook JSON into a compact, documentation-oriented outline (text).
 * Much smaller than raw or minimized JSON: no code, only param names, flow-ordered steps.
 * Best option for large playbooks before sending to AI (extractive compression).
 */
export function playbookToDocsOutline(jsonContent: string): string {
  try {
    const data = JSON.parse(jsonContent);
    const title = data.title || "Playbook";
    const startNode = data.start_node || "start";
    const description = data.description
      ? (data.description.length > 400 ? data.description.substring(0, 397) + "..." : data.description)
      : "";
    const nodes: Record<string, any> = data.nodes || {};
    const edges: Array<{ source_node: string; destination_node: string; label: string }> =
      data.edges || [];

    const edgesBySource = new Map<string, Array<{ dest: string; label: string }>>();
    for (const e of edges) {
      if (!edgesBySource.has(e.source_node)) {
        edgesBySource.set(e.source_node, []);
      }
      edgesBySource.get(e.source_node)!.push({
        dest: e.destination_node,
        label: e.label && e.label !== "DEFAULT_LABEL" ? e.label : "",
      });
    }

    // BFS order from start_node (so steps follow flow)
    const order: string[] = [];
    const visited = new Set<string>();
    const queue = [startNode];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      const outEdges = edgesBySource.get(id) || [];
      for (const { dest } of outEdges) {
        if (!visited.has(dest)) queue.push(dest);
      }
    }
    // Append any nodes not reachable from start (e.g. disconnected)
    for (const id of Object.keys(nodes)) {
      if (!visited.has(id)) order.push(id);
    }

    const lines: string[] = [];
    lines.push(`# ${title}`);
    if (description) lines.push(description);
    lines.push(`Start: ${startNode}`);
    lines.push("");

    lines.push("## Steps (flow order)");
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const node = nodes[id];
      if (!node) continue;
      const type = node.type || "";
      const subType = node.sub_type || "";
      const titleStr = (node.title || id).replace(/\n/g, " ");
      let step = `${i + 1}. [${id}] ${titleStr} (${type}${subType ? " / " + subType : ""})`;

      if (node.conditions && node.conditions.length > 0) {
        const labels = node.conditions.map((c: any) => c.label).filter(Boolean);
        if (labels.length) step += ` | Condition: ${labels.join(", ")}`;
      }

      if (node.actions && node.actions.length > 0) {
        const action = node.actions[0];
        const at = action.action_type || "";
        const actionTitle =
          action.action_data?.action_title ||
          action.action_title ||
          (at === "CUSTOM" ? "Custom script" : "") ||
          "";
        if (at || actionTitle) step += ` | Action: ${at}${actionTitle ? " - " + actionTitle : ""}`;
        if (action.playbook) step += ` | Calls playbook: ${action.playbook}`;
        if (action.parameter_data_source && typeof action.parameter_data_source === "object") {
          const keys = Object.keys(action.parameter_data_source);
          if (keys.length) step += ` | Inputs: ${keys.join(", ")}`;
        }
      }

      if (node.memory_params && Object.keys(node.memory_params).length > 0) {
        const keys = Object.keys(node.memory_params);
        step += ` | Memory: ${keys.join(", ")}`;
      }

      lines.push(step);
    }

    lines.push("");
    lines.push("## Edges");
    const edgeStrs = edges.map(
      (e) => `${e.source_node} → ${e.destination_node}${e.label && e.label !== "DEFAULT_LABEL" ? " (" + e.label + ")" : ""}`
    );
    lines.push(edgeStrs.join("; "));

    return lines.join("\n");
  } catch {
    return jsonContent;
  }
}

/** Max length for one file's content in a single request (leaves room for prompt). */
export const MAX_FILE_CONTENT_LENGTH = 28_000;

/**
 * If minimized JSON exceeds maxLength, truncate at a structural boundary so the
 * result is still valid JSON. Keeps as many full nodes as fit; edges filtered to
 * those nodes. Never returns invalid JSON (no mid-string truncation).
 */
export const truncatePlaybookJSONToLength = (
  minimizedJson: string,
  maxLength: number = MAX_FILE_CONTENT_LENGTH
): string => {
  if (minimizedJson.length <= maxLength) return minimizedJson;
  try {
    const parsed = JSON.parse(minimizedJson);
    const nodeIds = parsed.nodes ? Object.keys(parsed.nodes) : [];
    if (nodeIds.length === 0) {
      const minimal = JSON.stringify({ title: parsed.title, description: parsed.description });
      return minimal.length <= maxLength ? minimal : minimal.substring(0, maxLength - 3) + "...";
    }

    const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    const edgeOverhead = Math.min(edges.length * 60, 5000); // reserve space for edges
    const budget = maxLength - edgeOverhead - 200;

    const truncated: any = {
      title: parsed.title,
      start_node: parsed.start_node,
      type: parsed.type,
      status: parsed.status,
      description: parsed.description,
      nodes: {} as Record<string, unknown>,
      edges: [] as any[],
    };
    if (parsed.output_params) truncated.output_params = parsed.output_params;
    if (parsed.tags) truncated.tags = parsed.tags;
    if (parsed.labels) truncated.labels = parsed.labels;

    for (let i = 0; i < nodeIds.length; i++) {
      const id = nodeIds[i];
      truncated.nodes[id] = parsed.nodes[id];
      const keptIds = new Set(Object.keys(truncated.nodes));
      truncated.edges = edges.filter(
        (e: any) => keptIds.has(e.source_node) && keptIds.has(e.destination_node)
      );
      const out = JSON.stringify(truncated);
      if (out.length > maxLength) {
        delete truncated.nodes[id];
        const keptIds = new Set(Object.keys(truncated.nodes));
        truncated.edges = edges.filter(
          (e: any) => keptIds.has(e.source_node) && keptIds.has(e.destination_node)
        );
        break;
      }
    }

    return JSON.stringify(truncated);
  } catch {
    const fallback = JSON.stringify({
      title: "Playbook",
      error: "Content too large and could not be structurally truncated",
    });
    return fallback.length <= maxLength ? fallback : fallback.substring(0, maxLength - 3) + "...";
  }
};