/**
 * Policy Engine Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine, PolicyEffect, PolicySubject, PolicyAction } from '../policy';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('Default Policies', () => {
    it('should load default policies', () => {
      const rules = engine.listRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should have shell approval policy', () => {
      const rules = engine.listRules({ subject: 'tool' });
      const shellPolicy = rules.find(r => r.name.includes('Shell'));
      expect(shellPolicy).toBeDefined();
      expect(shellPolicy?.effect).toBe('require_human_approval');
    });
  });

  describe('Rule Management', () => {
    it('should add custom rules', () => {
      const initialCount = engine.listRules().length;
      
      engine.addRule({
        id: 'test_rule',
        name: 'Test Rule',
        effect: 'deny' as PolicyEffect,
        subjects: ['tool' as PolicySubject],
        actions: ['execute' as PolicyAction],
        priority: 200,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const count = engine.listRules().length;
      expect(count).toBe(initialCount + 1);
    });

    it('should enable and disable rules', () => {
      engine.addRule({
        id: 'toggle_rule',
        name: 'Toggle Rule',
        effect: 'allow' as PolicyEffect,
        subjects: ['agent' as PolicySubject],
        actions: ['read' as PolicyAction],
        priority: 50,
        enabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(engine.listRules({ enabled: false }).length).toBeGreaterThan(0);
      
      engine.enableRule('toggle_rule');
      const enabled = engine.listRules({ enabled: true });
      expect(enabled.some(r => r.id === 'toggle_rule')).toBe(true);
    });

    it('should remove rules', () => {
      engine.addRule({
        id: 'removable_rule',
        name: 'Removable Rule',
        effect: 'allow' as PolicyEffect,
        subjects: ['agent' as PolicySubject],
        actions: ['read' as PolicyAction],
        priority: 50,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const removed = engine.removeRule('removable_rule');
      expect(removed).toBe(true);
      expect(engine.getRule('removable_rule')).toBeUndefined();
    });
  });

  describe('Policy Evaluation', () => {
    it('should deny by default when no rule matches', () => {
      const result = engine.evaluate('unknown' as PolicySubject, 'unknown' as PolicyAction, {});
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('deny');
    });

    it('should allow for matched allow rule', () => {
      const result = engine.evaluate('agent' as PolicySubject, 'read' as PolicyAction, {});
      // Default allow rule should match
      expect(result.effect).toBe('allow');
    });

    it('should check tool category conditions', () => {
      const result = engine.canExecuteTool(
        'shell.command',
        'run_command',
        'shell'
      );
      // Should require approval for shell commands
      expect(result.requiresApproval).toBe(true);
    });

    it('should check task priority conditions', () => {
      const result = engine.canCreateTask('critical', false);
      // Critical tasks should require approval
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('Violation Tracking', () => {
    it('should record violations', () => {
      engine.recordViolation(
        'test_rule',
        'Test Rule',
        'shell_01',
        'tool' as PolicySubject,
        'execute' as PolicyAction,
        { toolId: 'shell.command' }
      );

      const violations = engine.getViolations();
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should clear violations', () => {
      engine.recordViolation(
        'test_rule',
        'Test Rule',
        'shell_01',
        'tool' as PolicySubject,
        'execute' as PolicyAction,
        {}
      );

      engine.clearViolations();
      expect(engine.getViolations().length).toBe(0);
    });
  });

  describe('Export/Import', () => {
    it('should export and import policies', () => {
      const exported = engine.exportPolicies();
      expect(typeof exported).toBe('string');
      expect(JSON.parse(exported).length).toBeGreaterThan(0);
    });
  });
});
