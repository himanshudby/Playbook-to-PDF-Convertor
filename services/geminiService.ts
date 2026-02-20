import { GoogleGenAI } from "@google/genai";
import {
  minimizePlaybookJSON,
  truncatePlaybookJSONToLength,
  playbookToDocsOutline,
  extractPlaybooksFromFile,
  MAX_FILE_CONTENT_LENGTH,
} from "../utils/fileHelpers";

/** Max total file content size per API request (prompt is ~6k; keep request well under context). */
const MAX_CONTENT_PER_REQUEST = 26_000;

// Declare window.aistudio for TypeScript
declare const window: {
  aistudio?: {
    getApiKey?: () => Promise<string>;
    hasSelectedApiKey?: () => Promise<boolean>;
  };
} & Window;

export const generateDocumentContent = async (
  fileContents: { name: string; content: string }[],
  manualApiKey?: string
): Promise<string> => {
  if (fileContents.length === 0) {
    throw new Error("No file content provided.");
  }

  // Priority: Manual API key > AI Studio > Environment variable
  let apiKey: string | undefined;
  
  // 1. Check manual API key first (session-only)
  if (manualApiKey && manualApiKey.trim()) {
    apiKey = manualApiKey.trim();
    console.log("Using manually entered API key");
  }
  // 2. Check AI Studio API
  else if (window.aistudio?.getApiKey) {
    try {
      apiKey = await window.aistudio.getApiKey();
      console.log("Using API key from AI Studio");
    } catch (error) {
      console.error("Failed to get API key from AI Studio:", error);
      throw new Error("API_KEY_NOT_FOUND");
    }
  }
  // 3. Fallback to environment variable
  else {
    apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (apiKey) {
      console.log("Using API key from environment variable");
    }
  }

  if (!apiKey) {
    throw new Error("API_KEY_NOT_FOUND");
  }

  // Create a new instance right before making the call to ensure it uses 
  // the up-to-date API key from the selection dialog as per security guidelines.
  const ai = new GoogleGenAI({ apiKey });

  // Construct a robust prompt for the model to generate HTML directly
  const promptParts = [
    "You are an expert technical writer and UI designer. Your task is to convert JSON playbook workflows into a beautiful, professionally styled HTML document.",
    " ",
    "### CRITICAL REQUIREMENTS:",
    "1. **Format**: Output raw HTML code only. Do NOT use markdown blocks (```html).",
    "2. **Styling**: Use Tailwind CSS classes for all styling. Make it look clean, modern, and professional (e.g., bg-slate-50, text-slate-800, border-slate-200).",
    "3. **Page Breaks**: Wrap EACH playbook in a container with the class `playbook-page`. DO NOT add any page-break-after styles. The CSS will handle page breaks automatically between playbooks.",
    "4. **Page Limit**: Each playbook section can span up to 2 pages. You are allowed to include more detailed content, longer summaries, and more workflow steps as needed to properly document the playbook.",
    "5. **Completeness**: You MUST generate a section for EVERY single JSON file provided below. Do not skip any files.",
    "6. **No Timestamp**: Do NOT add any 'Generated on [Date]' text or footer at the end of the document.",
    "7. **No Title Page**: Do NOT generate a main document title or cover page. Start directly with the content of the first playbook.",
    "8. **Language Precision**: Do NOT use speculative or uncertain language. Never use words like 'likely', 'probably', 'may', 'might', 'could', or 'possibly'. State facts directly based on the JSON data only.",
    " ",
    "### WORKFLOW STRUCTURE ANALYSIS (CRITICAL - MUST ANALYZE FIRST):",
    "You MUST perform a comprehensive structural analysis of ALL playbooks before generating any HTML content.",
    " ",
    "**Step 1: Identify Parent Playbooks**",
    "- A **Parent Playbook** is a playbook that calls or invokes other playbooks (sub-playbooks).",
    "- Look for indicators such as:",
    "  * Fields named 'playbook', 'sub_playbooks', 'child_playbooks', 'calls', 'references', 'includes'",
    "  * Actions with 'action_type' set to 'PLAYBOOK'",
    "  * Nodes that reference other playbook files or IDs",
    "  * Any field that contains playbook names, IDs, or references to other workflows",
    "- A parent playbook can have MULTIPLE sub-playbooks - list ALL of them.",
    " ",
    "**Step 2: Identify Sub-Playbooks**",
    "- A **Sub-Playbook** is a playbook that is called or invoked by a parent playbook.",
    "- Determine which parent playbook(s) call each sub-playbook.",
    "- A sub-playbook can be called by multiple parent playbooks.",
    " ",
    "**Step 3: Identify Standalone Playbooks**",
    "- A **Standalone Playbook** has no parent-child relationships with other playbooks.",
    "- It neither calls other playbooks nor is called by any parent.",
    " ",
    "**Step 4: Document Workflow Structure for Each Playbook**",
    "For EACH playbook, you MUST include a **Workflow Structure** section immediately after the header that clearly shows:",
    "- **Role Badge**: A prominent Tailwind badge showing the playbook's role:",
    "  * Use 'bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold' for 'Root/Parent Playbook'",
    "  * Use 'bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold' for 'Sub-Playbook'",
    "  * Use 'bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold' for 'Standalone Playbook'",
    "- **Parent Information** (if sub-playbook):",
    "  * Clearly state: 'Called by: [Parent Playbook Name(s)]'",
    "  * List all parent playbooks that invoke this sub-playbook",
    "  * Use a clean bullet list with indigo-colored text (text-indigo-600)",
    "- **Sub-Playbook List** (if parent playbook):",
    "  * Clearly state: 'Calls the following sub-playbooks:'",
    "  * List ALL sub-playbooks this parent invokes (there can be multiple)",
    "  * Use a clean nested bullet list with indigo-colored text (text-indigo-600)",
    "  * Format: Each sub-playbook name on its own line",
    "- **Standalone Indicator** (if standalone):",
    "  * State: 'This is a standalone playbook with no parent/child relationships'",
    "- **Integration Description**: Add a 1-2 sentence explanation of how this playbook fits into the overall workflow hierarchy.",
    " ",
    "### Structure Per Playbook (Repeat this for every file):",
    "For each JSON file, include in this EXACT order:",
    "1. **Header**: Playbook Name (H2, bold, indigo-700 color) + a badge for Type/Status if available.",
    "2. **Workflow Structure Section** (REQUIRED):",
    "   - Display the role badge (Parent/Sub/Standalone) as specified above",
    "   - Show parent information if it's a sub-playbook",
    "   - List ALL sub-playbooks if it's a parent (use nested bullet lists for multiple sub-playbooks)",
    "   - Include the integration description",
    "   - Use proper Tailwind styling: border-l-4 border-indigo-500 pl-4 py-2 bg-indigo-50 rounded",
    "3. **Summary**: Maximum 5 lines. Focus only on technical information - describe the technical goal, purpose, and key functionality. Keep it concise and technical.",
    "4. **Workflow Diagram/Steps**: Extract workflow steps DIRECTLY from the JSON structure. DO NOT guess or infer steps. Follow these rules:",
    "   - Start from the 'start_node' and follow the flow defined in the 'edges' array",
    "   - For each node in the flow, create a numbered step using the node's 'title' field",
    "   - If a node has 'actions', describe what action is performed (use 'action_title' or 'action' field if available)",
    "   - If a node has 'conditions', include the condition logic (use 'label' from conditions or edge labels)",
    "   - Follow the exact sequence defined by the edges - do not reorder or skip nodes",
    "   - For conditional nodes, show the branching paths (e.g., 'If condition X, go to step Y; else go to step Z')",
    "   - Only include steps that are explicitly present in the nodes and edges - do not add inferred or assumed steps",
    "   - Use the exact node titles and action names from the JSON - do not paraphrase or interpret",
    "   - Format: Each step should be numbered and clearly state what happens at that node based on the actual JSON data",
    "5. **Key Inputs**: A well-structured table showing all important parameters (Name, Type, Description if available). Include all relevant inputs, not just critical ones.",
    " ",
    "### Global Structure:",
    "- Output the HTML for all playbooks sequentially in one continuous stream.",
    "- Group related playbooks together when possible (parent followed by its sub-playbooks).",
    " ",
    "### Input Data:",
    "Input may be either (1) JSON playbook structure or (2) a compact text outline with '## Steps (flow order)' and '## Edges'. For outlines, each step line is: number. [node_id] title (type) | Action: ... | Inputs: ... Generate the same HTML sections (header, workflow structure, summary, steps, key inputs) from the outline using the step titles and flow.",
  ];

  // Expand each file into parent + embedded sub-playbooks so all get documented
  type PlaybookItem = { name: string; content: string; parentName?: string };
  const allPlaybooks: PlaybookItem[] = [];
  for (const file of fileContents) {
    const extracted = extractPlaybooksFromFile(file.content);
    for (const p of extracted) {
      allPlaybooks.push({ name: p.name, content: p.content, parentName: p.parentName });
    }
  }

  // Prepare each playbook: use docs outline when smaller, else minimized JSON
  type PreparedFile = {
    name: string;
    content: string;
    truncated?: boolean;
    isOutline?: boolean;
    parentName?: string;
  };
  const prepared: PreparedFile[] = allPlaybooks.map((playbook) => {
    let minimized: string;
    try {
      minimized = minimizePlaybookJSON(playbook.content);
    } catch {
      minimized = playbook.content;
    }
    const outline = playbookToDocsOutline(playbook.content);
    const useOutline = outline.length < minimized.length;
    let content = useOutline ? outline : minimized;
    const truncated = content.length > MAX_FILE_CONTENT_LENGTH;
    if (truncated) {
      content = useOutline
        ? outline.substring(0, MAX_FILE_CONTENT_LENGTH - 20) + "\n...[truncated]"
        : truncatePlaybookJSONToLength(minimized, MAX_FILE_CONTENT_LENGTH);
    }
    return {
      name: playbook.name,
      content,
      truncated,
      isOutline: useOutline,
      parentName: playbook.parentName,
    };
  });

  // Chunk files by total size so each request stays within context limits
  const chunks: PreparedFile[][] = [];
  let currentChunk: PreparedFile[] = [];
  let currentSize = 0;
  for (const file of prepared) {
    const fileSize = file.content.length + (file.name.length + 50);
    if (currentChunk.length > 0 && currentSize + fileSize > MAX_CONTENT_PER_REQUEST) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(file);
    currentSize += fileSize;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  const htmlParts: string[] = [];
  const isMultiChunk = chunks.length > 1;

  try {
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const chunkPromptParts = [...promptParts];

    // For multi-chunk, tell model this is a batch and not to add title/header for continuation
    if (isMultiChunk && c > 0) {
      chunkPromptParts.push(
        "\n(You are generating a continuation of a longer document. Output HTML for the playbooks below only. Do NOT add a document title, cover page, or 'Generated on' footer.)"
      );
    }

    chunk.forEach((file, index) => {
      const globalIndex = chunks.slice(0, c).reduce((sum, arr) => sum + arr.length, 0) + index + 1;
      chunkPromptParts.push(`\n--- FILE ${globalIndex}: ${file.name} ---`);
      if (file.parentName) {
        chunkPromptParts.push(`(Sub-playbook. Called by: ${file.parentName})`);
      }
      if (file.truncated) {
        chunkPromptParts.push("(This file was truncated due to length; document the workflow from the partial data above.)");
      }
      chunkPromptParts.push(file.content);
    });

    chunkPromptParts.push("\n### Output HTML:");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: chunkPromptParts.join('\n'),
      config: {
        temperature: 0.2,
      },
    });

    let text = response.text;
    if (!text) {
      throw new Error(`Gemini returned an empty response for chunk ${c + 1}/${chunks.length}.`);
    }
    htmlParts.push(text);
  }

    let text = htmlParts.join("\n");
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    // Cleanup if the model accidentally wraps in markdown despite instructions
    text = text.replace(/```html/g, '').replace(/```/g, '');
    
    // Remove any page-break-after styles that might cause blank pages
    text = text.replace(/page-break-after:\s*always/gi, '');
    text = text.replace(/style=['"]page-break-after:\s*always['"]/gi, '');
    text = text.replace(/style=['"][^'"]*page-break-after:\s*always[^'"]*['"]/gi, (match) => {
      // Remove page-break-after from style attribute, keep rest
      return match.replace(/page-break-after:\s*always;?/gi, '').replace(/;\s*;/g, ';');
    });

    return text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // If the error indicates a missing key or project, we let the UI handle a re-prompt
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_NOT_FOUND");
    }
    
    throw new Error("Failed to generate documentation. Please ensure you have a valid API key with billing enabled.");
  }
};