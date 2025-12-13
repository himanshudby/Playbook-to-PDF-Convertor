import React from 'react';
import { FileJson, X } from 'lucide-react';

interface UploadedFileListProps {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}

export const UploadedFileList: React.FC<UploadedFileListProps> = ({ files, onRemove, disabled }) => {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Selected Files ({files.length})</h3>
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-md shadow-sm hover:border-indigo-200 transition-colors"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <FileJson className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="text-sm text-slate-700 truncate font-medium">{file.name}</span>
            <span className="text-xs text-slate-400 flex-shrink-0">
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          {!disabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};