import { GoogleGenAI } from "@google/genai";
import { minimizePlaybookJSON } from "../utils/fileHelpers";

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
    "3. **Page Breaks**: Wrap EACH playbook in a container with the class `playbook-page`. Add `style='page-break-after: always'` to every playbook container except the last one.",
    "4. **Completeness**: You MUST generate a section for EVERY single JSON file provided below. Do not skip any files.",
    "5. **No Timestamp**: Do NOT add any 'Generated on [Date]' text or footer at the end of the document.",
    "6. **No Title Page**: Do NOT generate a main document title or cover page. Start directly with the content of the first playbook.",
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
    "3. **Executive Summary**: Maximum 3-4 lines. Concise description of the goal and purpose.",
    "4. **Workflow Diagram/Steps**: A compact numbered list of the logic flow. Merge minor steps. Limit to 5-8 key steps max.",
    "5. **Key Inputs**: A small, dense table showing only critical parameters (Name, Type).",
    " ",
    "### Global Structure:",
    "- Output the HTML for all playbooks sequentially in one continuous stream.",
    "- Group related playbooks together when possible (parent followed by its sub-playbooks).",
    " ",
    "### Input Data:",
  ];

  fileContents.forEach((file, index) => {
    promptParts.push(`\n--- FILE ${index + 1}: ${file.name} ---`);
    
    // Minimize JSON content to reduce size before sending to AI
    let minimizedContent: string;
    try {
      // Try to minimize if it's valid JSON
      minimizedContent = minimizePlaybookJSON(file.content);
    } catch (error) {
      // If minimization fails, use original content
      console.warn(`Failed to minimize ${file.name}, using original content`);
      minimizedContent = file.content;
    }
    
    // Still apply character limit but now on minimized content (allows more playbooks per request)
    const contentToSend = minimizedContent.length > 20000 
      ? minimizedContent.substring(0, 20000) + '...[truncated]'
      : minimizedContent;
    
    promptParts.push(contentToSend);
  });

  promptParts.push("\n### Output HTML:");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptParts.join('\n'),
      config: {
        temperature: 0.2,
      }
    });

    let text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    // Cleanup if the model accidentally wraps in markdown despite instructions
    text = text.replace(/```html/g, '').replace(/```/g, '');

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