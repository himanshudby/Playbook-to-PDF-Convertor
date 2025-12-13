export interface PlaybookFile {
  name: string;
  content: string;
}

export interface ProcessingState {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
}