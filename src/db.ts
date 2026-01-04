import { MonitorState, CheckHistory } from './types';

export class Database {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getMonitorState(monitorId: string): Promise<MonitorState | null> {
    return await this.db
      .prepare('SELECT * FROM monitors_state WHERE monitor_id = ?')
      .bind(monitorId)
      .first<MonitorState>();
  }

  async upsertMonitorState(state: MonitorState): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO monitors_state (monitor_id, status, last_checked_at, last_latency, fail_count, first_fail_time, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(monitor_id) DO UPDATE SET
         status = excluded.status,
         last_checked_at = excluded.last_checked_at,
         last_latency = excluded.last_latency,
         fail_count = excluded.fail_count,
         first_fail_time = excluded.first_fail_time,
         last_error = excluded.last_error`
      )
      .bind(
        state.monitor_id,
        state.status,
        state.last_checked_at,
        state.last_latency,
        state.fail_count,
        state.first_fail_time,
        state.last_error || null
      )
      .run();
  }

  async addCheckHistory(history: CheckHistory): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO check_history (monitor_id, timestamp, status, latency, message) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        history.monitor_id,
        history.timestamp,
        history.status,
        history.latency,
        history.message
      )
      .run();
  }

  async getHistory(monitorId: string, limit: number = 50): Promise<CheckHistory[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM check_history WHERE monitor_id = ? ORDER BY timestamp DESC LIMIT ?'
      )
      .bind(monitorId, limit)
      .all<CheckHistory>();
    return results.reverse(); // Return in chronological order
  }

  async getRecentHistory(limit: number = 60): Promise<CheckHistory[]> {
     const { results } = await this.db
      .prepare(
         `SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY monitor_id ORDER BY timestamp DESC) as rn
            FROM check_history
         ) WHERE rn <= ?`
      )
      .bind(limit)
      .all<CheckHistory>();
    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getAggregatedHistory(range: '24h' | '7d' | '14d'): Promise<CheckHistory[]> {
    let groupBySeconds: number;
    let timeLimit: number;
    const now = Date.now();

    if (range === '24h') {
      groupBySeconds = 3600; // 1 hour
      timeLimit = now - 24 * 3600 * 1000;
    } else if (range === '7d') {
      groupBySeconds = 12 * 3600; // 12 hours
      timeLimit = now - 7 * 24 * 3600 * 1000;
    } else { // 14d
      groupBySeconds = 24 * 3600; // 24 hours
      timeLimit = now - 14 * 24 * 3600 * 1000;
    }

    const { results } = await this.db.prepare(`
      SELECT 
        monitor_id,
        MIN(timestamp) as timestamp,
        CAST(AVG(latency) AS INTEGER) as latency,
        CASE 
          WHEN sum(CASE WHEN status = 'DOWN' THEN 1 ELSE 0 END) > 0 THEN 'DOWN'
          WHEN sum(CASE WHEN status = 'DEGRADED' THEN 1 ELSE 0 END) > 0 THEN 'DEGRADED'
          ELSE 'UP'
        END as status,
        NULL as message
      FROM check_history
      WHERE timestamp >= ?
      GROUP BY monitor_id, CAST(timestamp / 1000 / ? AS INTEGER)
      ORDER BY timestamp ASC
    `)
    .bind(timeLimit, groupBySeconds)
    .all<CheckHistory>();

    return results;
  }

  async getAllMonitorStates(): Promise<MonitorState[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM monitors_state')
      .all<MonitorState>();
    return results;
  }
}
