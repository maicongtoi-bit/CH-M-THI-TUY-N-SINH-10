export enum AppStep {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  RESULT = 'RESULT'
}

export interface FileWithPreview {
  file: File;
  preview: string;
  type: 'image' | 'pdf';
}

export interface GradingResult {
  markdownReport: string;
  jsonData: any;
}

export interface StudentSubmission {
  id: string;
  name: string;
  files: FileWithPreview[];
  status: 'idle' | 'processing' | 'done' | 'error';
  result?: GradingResult;
  error?: string;
}

export interface UploadState {
  examAndKey: FileWithPreview[];
  students: StudentSubmission[];
}