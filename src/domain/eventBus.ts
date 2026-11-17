import type {LogCategory, ObserverLogEntry} from './tripObserver';

type LogListener = (entry: ObserverLogEntry) => void;

class DomainEventLogger {
  private _logs: ObserverLogEntry[] = [];
  private _listeners: Set<LogListener> = new Set();

  public emit(category: LogCategory, title: string, lines: string[], tripId?: string): ObserverLogEntry {
    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 8);
    const entry: ObserverLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp,
      category,
      title,
      lines,
      tripId,
    };
    this._logs = [entry, ...this._logs].slice(0, 150);
    this._listeners.forEach((listener) => listener(entry));
    return entry;
  }

  public getLogs(): ObserverLogEntry[] {
    return this._logs;
  }

  public clear(): void {
    this._logs = [];
  }

  public subscribe(listener: LogListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
}

export const domainLogger = new DomainEventLogger();
