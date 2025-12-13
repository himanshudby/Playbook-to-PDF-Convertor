import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Cast the result of Array.from to File[] to fix 'unknown' type errors on properties
      const validFiles = (Array.from(e.dataTransfer.files) as File[]).filter(
        (file) => file.type === "application/json" || file.name.endsWith(".json")
      );
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
  };

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = Array.from(e.target.files) as File[];
      onFilesSelected(validFiles);
      // Reset input value to allow selecting the same file again if needed
      e.target.value = '';
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all cursor-pointer group ${
        disabled
          ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
          : isDragging
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".json,application/json"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />
      <div className={`p-3 rounded-full mb-3 ${isDragging ? 'bg-indigo-200' : 'bg-slate-100 group-hover:bg-indigo-100 transition-colors'}`}>
        <UploadCloud className={`w-6 h-6 ${isDragging ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`} />
      </div>
      <p className="text-sm font-medium text-slate-700">Click to upload or drag & drop</p>
      <p className="text-xs text-slate-500 mt-1">JSON files only</p>
    </div>
  );
};