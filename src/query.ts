import { TraceStore, type StoredControl, type StoredEvent } from "./store.ts";

/** Read-only boundary reserved for the future qb-trace server. */
export class TraceQueryService {
  private readonly store: TraceStore;

  constructor(databasePath: string) {
    this.store = new TraceStore(databasePath, { readOnly: true });
  }

  schemaVersion(): number { return this.store.schemaVersion(); }
  countEvents(): number { return this.store.countEvents(); }
  listSessionEvents(sessionId: string): StoredEvent[] { return this.store.listEvents(sessionId); }
  listRecordingControls(): StoredControl[] { return this.store.listControls(); }
  close(): void { this.store.close(); }
}
