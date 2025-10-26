export type ToolAction = 'revoked' | 'restored';

export interface ToolPolicyAuditEntry {
  toolId: string;
  action: ToolAction;
  reason?: string;
  actor?: string;
  timestamp: number;
}

export interface RevokeOptions {
  reason?: string;
  actor?: string;
}

export interface RestoreOptions {
  reason?: string;
  actor?: string;
}

export type PolicySubscriber = (tools: readonly string[]) => void;

export class McpToolPolicy {
  private readonly revoked = new Set<string>();

  private readonly auditTrail: ToolPolicyAuditEntry[] = [];

  private readonly subscribers = new Set<PolicySubscriber>();

  revoke(toolIds: Iterable<string>, options: RevokeOptions = {}): void {
    const now = Date.now();
    let changed = false;

    for (const toolId of toolIds) {
      if (!toolId) {
        continue;
      }
      if (this.revoked.has(toolId)) {
        continue;
      }
      this.revoked.add(toolId);
      changed = true;
      this.auditTrail.push({
        toolId,
        action: 'revoked',
        reason: options.reason,
        actor: options.actor,
        timestamp: now,
      });
    }

    if (changed) {
      this.publish();
    }
  }

  restore(toolIds: Iterable<string>, options: RestoreOptions = {}): void {
    const now = Date.now();
    let changed = false;

    for (const toolId of toolIds) {
      if (!this.revoked.has(toolId)) {
        continue;
      }
      this.revoked.delete(toolId);
      changed = true;
      this.auditTrail.push({
        toolId,
        action: 'restored',
        reason: options.reason,
        actor: options.actor,
        timestamp: now,
      });
    }

    if (changed) {
      this.publish();
    }
  }

  clear(): void {
    if (this.revoked.size === 0) {
      return;
    }
    const now = Date.now();
    for (const toolId of this.revoked) {
      this.auditTrail.push({
        toolId,
        action: 'restored',
        timestamp: now,
      });
    }
    this.revoked.clear();
    this.publish();
  }

  isRevoked(toolId: string): boolean {
    return this.revoked.has(toolId);
  }

  listRevoked(): string[] {
    return Array.from(this.revoked.values()).sort();
  }

  getAuditTrail(): ToolPolicyAuditEntry[] {
    return [...this.auditTrail];
  }

  subscribe(subscriber: PolicySubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.listRevoked());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private publish(): void {
    const snapshot = this.listRevoked();
    this.subscribers.forEach((subscriber) => subscriber(snapshot));
  }
}
