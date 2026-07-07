export interface KeyValueStorage {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
}

export class InMemoryKeyValueStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.values.get(key);
  }

  setString(key: string, value: string): void {
    this.values.set(key, value);
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  getAllKeys(): string[] {
    return Array.from(this.values.keys());
  }
}
