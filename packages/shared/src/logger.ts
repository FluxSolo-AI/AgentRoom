/**
 * Structured Logging
 * 
 * Provides consistent, structured logging across all services.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

// ============================================================
// Console Logger (Development)
// ============================================================

export class ConsoleLogger implements Logger {
  constructor(private service: string, private minLevel: LogLevel = 'debug') {}

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      context,
    };
    
    // Pretty print for development
    const colorCode = this.getColorCode(level);
    const reset = '\x1b[0m';
    
    let output = `${colorCode}[${entry.timestamp}] ${level.toUpperCase()} [${entry.service}]${reset} ${message}`;
    
    if (context && Object.keys(context).length > 0) {
      output += '\n' + JSON.stringify(context, null, 2)
        .split('\n')
        .map((line: string) => '  ' + line)
        .join('\n');
    }
    
    return output;
  }

  private getColorCode(level: LogLevel): string {
    switch (level) {
      case 'debug': return '\x1b[36m'; // cyan
      case 'info': return '\x1b[32m';   // green
      case 'warn': return '\x1b[33m';  // yellow
      case 'error': return '\x1b[31m'; // red
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatEntry('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatEntry('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatEntry('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorContext = error ? { 
        ...context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      } : context;
      
      console.error(this.formatEntry('error', message, errorContext));
    }
  }
}

// ============================================================
// JSON Logger (Production)
// ============================================================

export class JsonLogger implements Logger {
  constructor(private service: string, private minLevel: LogLevel = 'info') {}

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };
    
    console.log(JSON.stringify(entry));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.log('info', message, context);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.log('warn', message, context);
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.log('error', message, context, error);
    }
  }
}

// ============================================================
// Logger Factory
// ============================================================

export function createLogger(service: string, options?: {
  minLevel?: LogLevel;
  format?: 'console' | 'json';
}): Logger {
  const format = options?.format || (process.env.NODE_ENV === 'production' ? 'json' : 'console');
  const minLevel = options?.minLevel || (process.env.LOG_LEVEL as LogLevel) || 'debug';
  
  if (format === 'json') {
    return new JsonLogger(service, minLevel);
  }
  
  return new ConsoleLogger(service, minLevel);
}

// ============================================================
// Default export
// ============================================================

export const logger = createLogger('app');
