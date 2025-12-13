import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
// Vite exposes environment variables prefixed with VITE_ to the client
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.error("VITE_GEMINI_API_KEY is not set in environment variables");
  console.error("Please create a .env.local file with: VITE_GEMINI_API_KEY=your_api_key_here");
}

// Initialize the client - will fail gracefully if API key is missing
let ai: GoogleGenAI | null = null;
if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error("Failed to initialize Gemini client:", error);
  }
}

export const generateDocumentContent = async (fileContents: { name: string; content: string }[]): Promise<string> => {
  if (fileContents.length === 0) {
    throw new Error("No file content provided.");
  }

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
    promptParts.push(JSON.stringify(file.content).substring(0, 15000)); // Limit context per file to avoid token limits if files are huge
  });

  promptParts.push("\n### Output HTML:");

  if (!apiKey) {
    throw new Error("API key is not configured. Please set VITE_GEMINI_API_KEY in your .env.local file.");
  }

  if (!ai) {
    throw new Error("Gemini client is not initialized. Please check your API key configuration.");
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptParts.join('\n'),
      config: {
        temperature: 0.2, // Low temperature for consistent formatting
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
    
    // Provide more specific error messages
    if (error?.message?.includes('API key') || error?.message?.includes('authentication')) {
      throw new Error("Invalid API key. Please check your VITE_GEMINI_API_KEY in .env.local file.");
    }
    if (error?.message?.includes('quota') || error?.message?.includes('rate limit')) {
      throw new Error("API quota exceeded or rate limit reached. Please try again later.");
    }
    
    throw new Error(`Failed to generate documentation: ${error?.message || 'Unknown error'}`);
  }
};