import type { ModuleId, ResponseLength } from '@shared/modules';
import type { ChatAttachment, MarketContextBlock } from '@shared/types';

export interface StoredMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  /**
   * Provenance snapshot of the data the model was given for this answer, so an
   * old message can never be re-rendered as if it were based on live data.
   */
  contextFields?: MarketContextBlock['fields'];
  contextGeneratedAt?: string;
}

export interface ChatSession {
  id: string;
  moduleId: ModuleId;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export interface SessionSummary {
  id: string;
  moduleId: ModuleId;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface UiPreferences {
  responseLength: ResponseLength;
  lastModuleId: ModuleId;
}
