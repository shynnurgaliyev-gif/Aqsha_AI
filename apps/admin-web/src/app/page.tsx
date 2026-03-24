export const dynamic = 'force-dynamic';

import {
  getUserStats,
  getJobCounts,
  getRecommendationCounts,
  getRecentAdminEvents,
  getRecentFailedJobs,
  type AdminEvent,
  type FailedJob,
} from '@/lib/queries';

function statusTag(status: string): React.ReactNode {
  const map: Record<string, string> = {
    trial: 'tag-trial',
    active: 'tag-active',
    grace: 'tag-grace',
    pending: 'tag-pending',
    expired: 'tag-expired',
    blocked: 'tag-blocked',
    canceled: 'tag-canceled',
    failed: 'tag-failed',
    done: 'tag-done',
  };
  const cls = map[status] ?? 'tag-default';
  return <span className={`tag ${cls}`}>{status}</span>;
}

export default async function DashboardPage() {
  const [users, jobs, recs, events, failedJobs] = await Promise.all([
    getUserStats(),
    getJobCounts(),
    getRecommendationCounts(),
    getRecentAdminEvents(20),
    getRecentFailedJobs(10),
  ]);

  const refreshedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <>
      {/* ----------------------------------------------------------------- */}
      {/* Overview cards                                                      */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <h2>
          Users
          <span className="refresh">refreshed {refreshedAt}</span>
        </h2>
        <div className="cards">
          <div className="card">
            <div className="label">Total users</div>
            <div className="value">{users.total}</div>
          </div>
          {users.byPlanStatus.map((s) => (
            <div key={s.status} className="card">
              <div className="label">{s.status}</div>
              <div className="value">{s.count}</div>
              <div className="sub">
                {users.total > 0 ? Math.round((s.count / users.total) * 100) : 0}%
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Job queue</h2>
        <div className="cards">
          {jobs.byStatus.length === 0 ? (
            <div className="card">
              <div className="label">no jobs</div>
              <div className="value">0</div>
            </div>
          ) : (
            jobs.byStatus.map((s) => (
              <div key={s.status} className="card">
                <div className="label">{s.status}</div>
                <div className="value">{s.count}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2>Daily recommendations</h2>
        <div className="cards">
          {recs.byDeliveryStatus.length === 0 ? (
            <div className="card">
              <div className="label">no records</div>
              <div className="value">0</div>
            </div>
          ) : (
            recs.byDeliveryStatus.map((s) => (
              <div key={s.status} className="card">
                <div className="label">{s.status}</div>
                <div className="value">{s.count}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Recent failed jobs                                                  */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <h2>Recent failed jobs</h2>
        {failedJobs.length === 0 ? (
          <table>
            <tbody>
              <tr>
                <td className="empty">No failed jobs</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Attempts</th>
                <th>Error</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {failedJobs.map((job: FailedJob) => (
                <tr key={job.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{job.id.slice(0, 8)}…</td>
                  <td>{job.job_type}</td>
                  <td>{job.attempts}</td>
                  <td style={{ color: '#dc2626', maxWidth: 300 }}>{job.error_message ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{job.updated_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Recent admin events                                                 */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <h2>Recent admin events</h2>
        {events.length === 0 ? (
          <table>
            <tbody>
              <tr>
                <td className="empty">No admin events yet</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Event type</th>
                <th>Source</th>
                <th>User</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev: AdminEvent) => (
                <tr key={ev.id}>
                  <td>{statusTag(ev.event_type)}</td>
                  <td>{ev.event_source}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {ev.user_id ? ev.user_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{ev.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
