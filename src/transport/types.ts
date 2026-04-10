export interface IncomingMessage {
  id: string;
  guid?: string;
  chatId?: string;
  from: string;
  text: string;
  imagePath?: string;
  timestamp: number;
}
