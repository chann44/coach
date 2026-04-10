export interface IncomingAttachment {
  path: string;
  mimeType?: string;
  filename?: string;
}

export interface IncomingMessage {
  id: string;
  guid?: string;
  chatId?: string;
  from: string;
  text: string;
  imagePath?: string;
  attachments?: IncomingAttachment[];
  timestamp: number;
}
