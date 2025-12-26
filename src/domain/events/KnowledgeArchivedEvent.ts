import { DomainEvent } from './DomainEvent.js';
import { KnowledgeItem } from '../entities/KnowledgeItem.js';

/**
 * 知見がアーカイブされたイベント
 * 100件超過時に発火
 */
export class KnowledgeArchivedEvent implements DomainEvent {
  readonly eventType = 'KnowledgeArchived';
  readonly occurredOn: Date;

  constructor(
    readonly archivedItems: readonly KnowledgeItem[],
    readonly archivedCount: number,
    readonly category: string,
    readonly language: string
  ) {
    this.occurredOn = new Date();
  }
}
