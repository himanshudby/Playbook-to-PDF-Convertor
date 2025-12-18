import { GoogleGenAI } from "@google/genai";

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
    "3. **Length Constraint**: Each playbook MUST fit on exactly ONE A4 page. You must summarize strictly.",
    "4. **Page Breaks**: Wrap EACH playbook in a container with the class `playbook-page`. Add `style='page-break-after: always'` to every playbook container except the last one.",
    "5. **Completeness**: You MUST generate a section for EVERY single JSON file provided below. Do not skip any files.",
    "6. **No Timestamp**: Do NOT add any 'Generated on [Date]' text or footer at the end of the document.",
    "7. **No Title Page**: Do NOT generate a main document title or cover page. Start directly with the content of the first playbook.",
    " ",
    "### Structure Per Playbook (Repeat this for every file):",
    "For each JSON file:",
    "- **Header**: Playbook Name (H2, bold, indigo color) + a badge for Type/Status if available.",
    "- **Executive Summary**: Maximum 3-4 lines. Concise description of the goal.",
    "- **Workflow Diagram/Steps**: A compact numbered list of the logic flow. Merge minor steps. Limit to 5-8 key steps max.",
    "- **Key Inputs**: A small, dense table showing only critical parameters (Name, Type).",
    " ",
    "### Global Structure:",
    "- Output the HTML for all playbooks sequentially in one continuous stream.",
    " ",
    "### Input Data:",
  ];

  fileContents.forEach((file, index) => {
    promptParts.push(`\n--- FILE ${index + 1}: ${file.name} ---`);
    promptParts.push(JSON.stringify(file.content).substring(0, 15000));
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