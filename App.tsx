import React, { useState, useRef, useEffect } from 'react';
import { FileUp, FileText, Loader2, Download, RefreshCw, Image, X, ShieldCheck, ExternalLink } from 'lucide-react';
import { generateDocumentContent } from './services/geminiService';
import { readFilesAsText } from './utils/fileHelpers';
import { FileUploader } from './components/FileUploader';
import { UploadedFileList } from './components/UploadedFileList';

// Declare html2pdf and aistudio globally
declare const html2pdf: any;
declare const window: any;

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Fallback for environments without the selection utility
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success as per instructions to avoid race condition issues
      setHasKey(true);
    }
  };

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogo(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (files.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedContent(null);

    try {
      const fileContents = await readFilesAsText(files);
      const content = await generateDocumentContent(fileContents);
      setGeneratedContent(content);
    } catch (err: any) {
      if (err.message === "API_KEY_NOT_FOUND") {
        setError("Your API key was not found or is invalid. Please reconnect.");
        setHasKey(false);
      } else {
        setError(err instanceof Error ? err.message : "Failed to generate documentation.");
      }
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('document-preview-content');
    if (!element) return;

    const opt = {
      margin: [0, 0, 0, 0],
      filename: 'playbook-documentation.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(element).save();
  };

  // 1. Initial Loading State
  if (hasKey === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // 2. Key Selection Gateway
  if (!hasKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 p-8 flex flex-col items-center text-white">
            <div className="bg-white/20 p-4 rounded-full mb-4">
              <ShieldCheck className="w-12 h-12" />
            </div>
            <h1 className="text-2xl font-bold">Secure Connection</h1>
            <p className="text-indigo-100 text-center mt-2">
              Playbook DocuGen requires a personal API key to process your data securely.
            </p>
          </div>
          <div className="p-8 space-y-6">
            <div className="text-sm text-slate-600 space-y-4">
              <p>
                To maintain privacy and ensure you stay within your own usage limits, please connect your Gemini API key from a paid Google Cloud project.
              </p>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-indigo-600 font-medium hover:underline"
              >
                Learn about Gemini API billing
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button
              onClick={handleOpenKeyDialog}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-indigo-200"
            >
              Connect My API Key
            </button>
            <p className="text-center text-xs text-slate-400">
              Your key is handled securely and is never stored on our servers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Main Application Interface
  return (
    <div className="min-h-screen flex flex-col animate-in fade-in duration-700">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Playbook DocuGen</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setHasKey(false)}
              className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50"
            >
              <ShieldCheck className="w-3 h-3" />
              Change Key
            </button>
            <div className="text-sm text-slate-500 hidden sm:block">
              Powered by Gemini 2.5 Flash
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FileUp className="w-4 h-4" />
                Input Playbooks
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <FileUploader onFilesSelected={handleFilesSelected} disabled={isGenerating} />
              <UploadedFileList files={files} onRemove={handleRemoveFile} disabled={isGenerating} />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Report Customization
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Document Logo
                </label>
                {!logo ? (
                  <div 
                    onClick={() => !isGenerating && logoInputRef.current?.click()}
                    className={`border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-colors ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Image className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs text-slate-500">Click to upload logo</span>
                    <input 
                      ref={logoInputRef}
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleLogoUpload}
                      disabled={isGenerating}
                    />
                  </div>
                ) : (
                  <div className="relative border border-slate-200 rounded-lg p-2 bg-slate-50 flex items-center justify-center">
                    <img src={logo} alt="Logo preview" className="h-16 object-contain" />
                    <button 
                      onClick={removeLogo}
                      disabled={isGenerating}
                      className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-slate-200 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Short Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isGenerating}
                  placeholder="Enter a brief summary or introduction for the document..."
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border min-h-[100px]"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <button
              onClick={handleGenerate}
              disabled={files.length === 0 || isGenerating}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all ${
                files.length === 0 || isGenerating
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Docs...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Generate Documentation
                </>
              )}
            </button>
            {error && (
              <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}
            <p className="mt-3 text-xs text-slate-400 text-center">
              Processing {files.length} file{files.length !== 1 ? 's' : ''}.
            </p>
          </div>

        </div>

        {/* Right Column: Preview & Export */}
        <div className="lg:col-span-8 h-[calc(100vh-8rem)] flex flex-col">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Document Preview
              </h2>
              {generatedContent && (
                <button
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto preview-scroll bg-slate-100 relative p-4 sm:p-8">
              {generatedContent ? (
                <div className="shadow-2xl mx-auto bg-white min-h-[1000px] w-full max-w-[210mm]">
                    <div id="document-preview-content">
                       {/* branding Header */}
                       {(logo || description) && (
                         <div className="px-10 pt-10 pb-4 text-center border-b border-slate-100 mb-0">
                           {logo && (
                             <img 
                               src={logo} 
                               alt="Report Logo" 
                               className="h-24 mx-auto object-contain mb-6" 
                             />
                           )}
                           {description && (
                             <div className="text-slate-600 max-w-2xl mx-auto whitespace-pre-wrap font-medium text-left px-4">
                               {description}
                             </div>
                           )}
                         </div>
                       )}
                       
                       {/* Generated Content */}
                       <div 
                         className="generated-html-content"
                         dangerouslySetInnerHTML={{ __html: generatedContent }} 
                       />
                    </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center border-2 border-dashed border-slate-200 rounded-lg">
                  {isGenerating ? (
                     <div className="flex flex-col items-center gap-4 animate-pulse">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                           <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        </div>
                        <div className="space-y-2">
                           <p className="font-medium text-slate-600">Analyzing Workflows...</p>
                           <p className="text-sm">Gemini is structuring your PDF documentation.</p>
                        </div>
                     </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-600">No documentation generated yet</p>
                      <p className="text-sm mt-1 max-w-xs">Upload JSON playbooks and click "Generate" to see the formatted document here.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default App;