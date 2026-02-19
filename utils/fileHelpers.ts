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

/**
 * Minimizes JSON playbook content by removing unnecessary fields while preserving
 * essential workflow structure information needed for AI analysis.
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
    if (parsed.description) minimized.description = parsed.description;

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

        // Keep description if it exists
        if (nodeData.description) minNode.description = nodeData.description;

        // Minimize actions - keep only essential fields
        if (nodeData.actions && Array.isArray(nodeData.actions)) {
          minNode.actions = nodeData.actions.map((action: any) => {
            const minAction: any = {
              action_type: action.action_type,
              action: action.action,
            };

            // Keep playbook reference if it exists (critical for parent/sub detection)
            if (action.playbook) minAction.playbook = action.playbook;
            if (action.playbook_data) minAction.playbook_data = action.playbook_data;

            // Keep action title and app info
            if (action.action_data?.action_title) {
              minAction.action_title = action.action_data.action_title;
            }
            if (action.action_data?.app_title) {
              minAction.app_title = action.action_data.app_title;
            }

            // Keep parameter data source (but simplified)
            if (action.parameter_data_source) {
              minAction.parameter_data_source = action.parameter_data_source;
            }

            // Remove code blocks or truncate them significantly
            if (action.code) {
              // Keep only first 200 chars of code as a summary
              minAction.code_summary = action.code.substring(0, 200) + (action.code.length > 200 ? '...' : '');
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

/** Max length for one file's content in a single request (leaves room for prompt). */
export const MAX_FILE_CONTENT_LENGTH = 50_000;

/**
 * If minimized JSON exceeds maxLength, truncate at a structural boundary so the
 * result is still valid JSON and the model gets a complete (partial) playbook.
 * Keeps as many full nodes as fit, and edges that only reference those nodes.
 */
export const truncatePlaybookJSONToLength = (
  minimizedJson: string,
  maxLength: number = MAX_FILE_CONTENT_LENGTH
): string => {
  if (minimizedJson.length <= maxLength) return minimizedJson;
  try {
    const parsed = JSON.parse(minimizedJson);
    const nodeIds = parsed.nodes ? Object.keys(parsed.nodes) : [];
    if (nodeIds.length === 0) return minimizedJson.substring(0, maxLength - 20) + '...[truncated]}';

    const truncated: any = {
      title: parsed.title,
      start_node: parsed.start_node,
      type: parsed.type,
      status: parsed.status,
      description: parsed.description,
      nodes: {},
      edges: [],
    };
    if (parsed.output_params) truncated.output_params = parsed.output_params;
    if (parsed.tags) truncated.tags = parsed.tags;
    if (parsed.labels) truncated.labels = parsed.labels;

    const overhead = JSON.stringify(truncated).length + 100;
    const budget = maxLength - overhead - 50; // reserve for "...[truncated]" and closing

    for (let i = 0; i < nodeIds.length; i++) {
      const id = nodeIds[i];
      const node = parsed.nodes[id];
      const nodeStr = JSON.stringify({ [id]: node });
      if (JSON.stringify(truncated.nodes).length + nodeStr.length > budget) break;
      truncated.nodes[id] = node;
    }

    const keptIds = new Set(Object.keys(truncated.nodes));
    if (parsed.edges && Array.isArray(parsed.edges)) {
      truncated.edges = parsed.edges.filter(
        (e: any) => keptIds.has(e.source_node) && keptIds.has(e.destination_node)
      );
    }

    const out = JSON.stringify(truncated);
    return out.length > maxLength
      ? out.substring(0, maxLength - 20) + '...[truncated]'
      : out;
  } catch {
    return minimizedJson.substring(0, maxLength - 20) + '...[truncated]';
  }
};