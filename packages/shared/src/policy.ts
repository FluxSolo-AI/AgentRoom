/**
 * Policy Engine
 * 
 * Provides policy-based access control and enforcement.
 * Policies can control agent behavior, tool usage, and human interventions.
 */

import { createLogger, Logger } from './logger';

// ============================================================
// Policy Types
// ============================================================

export type PolicyEffect = 'allow' | 'deny' | 'require_human_approval' | 'log_only';
export type PolicySubject = 'agent' | 'tool' | 'task' | 'room' | 'system';
export type PolicyAction = 
  | 'execute' 
  | 'read' 
  | 'write' 
  | 'delete' 
  | 'approve'
  | 'reject'
  | 'create'
  | 'use';

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'gt' | 'lt' | 'exists';
  value: unknown;
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  effect: PolicyEffect;
  subjects: PolicySubject[];
  actions: PolicyAction[];
  conditions?: PolicyCondition[];
  priority: number; // Higher priority rules are evaluated first
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyEvaluation {
  allowed: boolean;
  effect: PolicyEffect;
  matchedRule?: PolicyRule;
  reason?: string;
  requiresApproval?: boolean;
}

export interface PolicyViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  subject: string;
  subjectType: PolicySubject;
  action: PolicyAction;
  timestamp: string;
  context: Record<string, unknown>;
}

// ============================================================
// Default Policies
// ============================================================

export const DefaultPolicies: Omit<PolicyRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Tool usage policies
  {
    name: 'Shell Command Approval',
    description: 'Shell commands require human approval',
    effect: 'require_human_approval',
    subjects: ['tool'],
    actions: ['execute'],
    conditions: [
      { field: 'tool.category', operator: 'equals', value: 'shell' },
    ],
    priority: 100,
    enabled: true,
  },

  {
    name: 'File Write Approval',
    description: 'File writes require human approval',
    effect: 'require_human_approval',
    subjects: ['tool'],
    actions: ['execute'],
    conditions: [
      { field: 'tool.name', operator: 'contains', value: 'write' },
    ],
    priority: 90,
    enabled: true,
  },

  // Task policies
  {
    name: 'Critical Task Human Approval',
    description: 'Critical priority tasks require human approval',
    effect: 'require_human_approval',
    subjects: ['task'],
    actions: ['execute', 'create'],
    conditions: [
      { field: 'task.priority', operator: 'equals', value: 'critical' },
    ],
    priority: 80,
    enabled: true,
  },

  {
    name: 'High Priority Task Logging',
    description: 'Log high priority task operations',
    effect: 'log_only',
    subjects: ['task'],
    actions: ['create', 'execute'],
    conditions: [
      { field: 'task.priority', operator: 'in', value: ['high', 'critical'] },
    ],
    priority: 50,
    enabled: true,
  },

  // Room policies
  {
    name: 'Agent Rate Limiting',
    description: 'Limit agent message rate',
    effect: 'deny',
    subjects: ['agent'],
    actions: ['write'],
    conditions: [
      { field: 'agent.messageCount', operator: 'gt', value: 100 },
    ],
    priority: 40,
    enabled: false, // Disabled by default
  },

  // Default allow
  {
    name: 'Default Allow',
    description: 'Allow all other actions by default',
    effect: 'allow',
    subjects: ['agent', 'tool', 'task', 'room'],
    actions: ['execute', 'read', 'write', 'create'],
    priority: 0,
    enabled: true,
  },
];

// ============================================================
// Policy Engine
// ============================================================

export class PolicyEngine {
  private rules: Map<string, PolicyRule> = new Map();
  private violations: PolicyViolation[] = [];
  private logger: Logger;
  private maxViolations = 1000;

  constructor(logger?: Logger) {
    this.logger = logger || createLogger('policy-engine');
    this.loadDefaultPolicies();
  }

  // ============================================================
  // Rule Management
  // ============================================================

  private loadDefaultPolicies(): void {
    for (const policy of DefaultPolicies) {
      this.addRule({
        ...policy,
        id: `policy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    this.logger.info('Default policies loaded', { count: DefaultPolicies.length });
  }

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info('Policy rule added', { 
      ruleId: rule.id, 
      name: rule.name,
      effect: rule.effect 
    });
  }

  updateRule(ruleId: string, updates: Partial<PolicyRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    const updated = { ...rule, ...updates, updatedAt: new Date().toISOString() };
    this.rules.set(ruleId, updated);
    
    this.logger.info('Policy rule updated', { ruleId, name: rule.name });
    return true;
  }

  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.logger.info('Policy rule removed', { ruleId });
    }
    return deleted;
  }

  getRule(ruleId: string): PolicyRule | undefined {
    return this.rules.get(ruleId);
  }

  listRules(filters?: { enabled?: boolean; subject?: PolicySubject }): PolicyRule[] {
    let rules = Array.from(this.rules.values());

    if (filters?.enabled !== undefined) {
      rules = rules.filter(r => r.enabled === filters.enabled);
    }

    if (filters?.subject) {
      rules = rules.filter(r => r.subjects.includes(filters.subject!));
    }

    return rules.sort((a, b) => b.priority - a.priority);
  }

  enableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: true });
  }

  disableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: false });
  }

  // ============================================================
  // Policy Evaluation
  // ============================================================

  evaluate(
    subjectType: PolicySubject,
    action: PolicyAction,
    context: Record<string, unknown>
  ): PolicyEvaluation {
    // Get applicable rules, sorted by priority (highest first)
    const applicableRules = this.listRules({ enabled: true })
      .filter(rule => 
        rule.subjects.includes(subjectType) && 
        rule.actions.includes(action)
      )
      .sort((a, b) => b.priority - a.priority);

    this.logger.debug('Evaluating policy', { 
      subjectType, 
      action, 
      applicableRules: applicableRules.length 
    });

    for (const rule of applicableRules) {
      // Check conditions
      if (rule.conditions && !this.evaluateConditions(rule.conditions, context)) {
        continue;
      }

      // Rule matched
      this.logger.debug('Policy rule matched', { 
        ruleId: rule.id, 
        name: rule.name,
        effect: rule.effect 
      });

      const evaluation: PolicyEvaluation = {
        allowed: rule.effect !== 'deny',
        effect: rule.effect,
        matchedRule: rule,
        reason: rule.description,
      };

      if (rule.effect === 'require_human_approval') {
        evaluation.requiresApproval = true;
        evaluation.allowed = false;
      }

      return evaluation;
    }

    // No rule matched - deny by default for safety
    return {
      allowed: false,
      effect: 'deny',
      reason: 'No matching policy found',
    };
  }

  private evaluateConditions(conditions: PolicyCondition[], context: Record<string, unknown>): boolean {
    for (const condition of conditions) {
      const value = this.getNestedValue(context, condition.field);

      let matches = false;

      switch (condition.operator) {
        case 'equals':
          matches = value === condition.value;
          break;

        case 'not_equals':
          matches = value !== condition.value;
          break;

        case 'contains':
          if (typeof value === 'string' && typeof condition.value === 'string') {
            matches = value.includes(condition.value);
          }
          break;

        case 'in':
          if (Array.isArray(condition.value)) {
            matches = condition.value.includes(value);
          }
          break;

        case 'gt':
          if (typeof value === 'number' && typeof condition.value === 'number') {
            matches = value > condition.value;
          }
          break;

        case 'lt':
          if (typeof value === 'number' && typeof condition.value === 'number') {
            matches = value < condition.value;
          }
          break;

        case 'exists':
          matches = value !== undefined && value !== null;
          break;
      }

      if (!matches) {
        return false;
      }
    }

    return true;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    // First, check if the key exists as-is (for flat keys like 'tool.category')
    if (path in obj) {
      return obj[path];
    }
    
    // Then try nested access
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  // ============================================================
  // Violation Tracking
  // ============================================================

  recordViolation(
    ruleId: string,
    ruleName: string,
    subject: string,
    subjectType: PolicySubject,
    action: PolicyAction,
    context: Record<string, unknown>
  ): void {
    const violation: PolicyViolation = {
      id: `violation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ruleId,
      ruleName,
      subject,
      subjectType,
      action,
      timestamp: new Date().toISOString(),
      context,
    };

    this.violations.push(violation);

    // Trim old violations
    if (this.violations.length > this.maxViolations) {
      this.violations = this.violations.slice(-this.maxViolations);
    }

    this.logger.warn('Policy violation recorded', { 
      violationId: violation.id,
      ruleName,
      subject,
      action 
    });
  }

  getViolations(filters?: {
    since?: Date;
    subject?: string;
    action?: PolicyAction;
    limit?: number;
  }): PolicyViolation[] {
    let violations = this.violations;

    if (filters?.since) {
      violations = violations.filter(v => new Date(v.timestamp) >= filters.since!);
    }

    if (filters?.subject) {
      violations = violations.filter(v => v.subject === filters.subject);
    }

    if (filters?.action) {
      violations = violations.filter(v => v.action === filters.action);
    }

    violations = violations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    if (filters?.limit) {
      violations = violations.slice(0, filters.limit);
    }

    return violations;
  }

  clearViolations(): void {
    this.violations = [];
    this.logger.info('Violations cleared');
  }

  // ============================================================
  // Convenience Methods
  // ============================================================

  canExecuteTool(toolId: string, toolName: string, toolCategory: string): PolicyEvaluation {
    return this.evaluate('tool', 'execute', {
      'tool.id': toolId,
      'tool.name': toolName,
      'tool.category': toolCategory,
    });
  }

  canCreateTask(priority: string, requiresHuman: boolean): PolicyEvaluation {
    return this.evaluate('task', 'create', {
      'task.priority': priority,
      'task.requiresHuman': requiresHuman,
    });
  }

  canExecuteTask(taskId: string, priority: string, assignedTo: string): PolicyEvaluation {
    return this.evaluate('task', 'execute', {
      'task.id': taskId,
      'task.priority': priority,
      'task.assignedTo': assignedTo,
    });
  }

  // ============================================================
  // Persistence
  // ============================================================

  exportPolicies(): string {
    return JSON.stringify(Array.from(this.rules.values()), null, 2);
  }

  importPolicies(data: string): boolean {
    try {
      const rules = JSON.parse(data) as PolicyRule[];
      for (const rule of rules) {
        this.rules.set(rule.id, rule);
      }
      this.logger.info('Policies imported', { count: rules.length });
      return true;
    } catch (error) {
      this.logger.error('Failed to import policies', error as Error);
      return false;
    }
  }
}

// ============================================================
// Singleton
// ============================================================

export const globalPolicyEngine = new PolicyEngine();
