/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides fault tolerance for external service calls.
 * Prevents cascading failures by opening circuit after threshold.
 */

import { createLogger, Logger } from './logger';

// ============================================================
// Circuit States
// ============================================================

export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',           // Failing, reject all calls
  HALF_OPEN = 'half_open', // Testing recovery
}

// ============================================================
// Circuit Breaker Options
// ============================================================

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;    // Number of failures before opening
  successThreshold: number;     // Number of successes in half-open to close
  timeout: number;             // Time in ms before trying half-open
  resetTimeout?: number;       // Time in ms to reset failure count (optional sliding window)
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  name: 'default',
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
};

// ============================================================
// Circuit Breaker
// ============================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private logger: Logger;
  private options: CircuitBreakerOptions;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = createLogger(`circuit-breaker:${this.options.name}`);
  }

  // ============================================================
  // State Management
  // ============================================================

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  // ============================================================
  // Execute with Circuit Breaker
  // ============================================================

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.timeout) {
        this.transitionToHalfOpen();
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN. Retry after ${this.getRetryAfter()}ms`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      this.logger.debug('Circuit breaker success in half-open state', {
        successes: this.successes,
        threshold: this.options.successThreshold,
      });

      if (this.successes >= this.options.successThreshold) {
        this.transitionToClosed();
      }
    }

    // Reset failure count in closed state
    if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failures++;

    this.logger.warn('Circuit breaker failure', {
      failures: this.failures,
      threshold: this.options.failureThreshold,
      state: this.state,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED && this.failures >= this.options.failureThreshold) {
      this.transitionToOpen();
    }
  }

  // ============================================================
  // State Transitions
  // ============================================================

  private transitionToOpen(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.successes = 0;
      this.logger.warn('Circuit breaker OPENED', {
        failures: this.failures,
        threshold: this.options.failureThreshold,
      });
    }
  }

  private transitionToHalfOpen(): void {
    if (this.state !== CircuitState.HALF_OPEN) {
      this.state = CircuitState.HALF_OPEN;
      this.successes = 0;
      this.logger.info('Circuit breaker entering HALF-OPEN state');
    }
  }

  private transitionToClosed(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.failures = 0;
      this.successes = 0;
      this.logger.info('Circuit breaker CLOSED - recovered');
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  private getRetryAfter(): number {
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.options.timeout - elapsed);
  }

  // Manual control
  reset(): void {
    this.transitionToClosed();
    this.logger.info('Circuit breaker manually reset');
  }

  forceOpen(): void {
    this.transitionToOpen();
    this.logger.warn('Circuit breaker manually forced OPEN');
  }

  forceClosed(): void {
    this.transitionToClosed();
    this.logger.info('Circuit breaker manually forced CLOSED');
  }

  // Status
  getStatus(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailure: string;
    retryAfter: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: new Date(this.lastFailureTime).toISOString(),
      retryAfter: this.getRetryAfter(),
    };
  }
}

// ============================================================
// Error Class
// ============================================================

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================
// Circuit Breaker Registry
// ============================================================

export class CircuitBreakerRegistry {
  private circuits: Map<string, CircuitBreaker> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = createLogger('circuit-breaker-registry');
  }

  get(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.circuits.has(name)) {
      const circuit = new CircuitBreaker({ name, ...options });
      this.circuits.set(name, circuit);
      this.logger.info('Circuit breaker registered', { name });
    }
    return this.circuits.get(name)!;
  }

  list(): Map<string, CircuitBreaker> {
    return this.circuits;
  }

  getAllStatus(): Record<string, ReturnType<CircuitBreaker['getStatus']>> {
    const status: Record<string, ReturnType<CircuitBreaker['getStatus']>> = {};
    for (const [name, circuit] of this.circuits) {
      status[name] = circuit.getStatus();
    }
    return status;
  }
}

// Global registry
export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();
