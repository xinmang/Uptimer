import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '../app/AuthContext';
import {
  fetchAdminAnalyticsOverview,
  fetchAdminMonitors,
  fetchAdminMonitorAnalytics,
  fetchAdminMonitorOutages,
} from '../api/client';
import type { AnalyticsOverviewRange, AnalyticsRange } from '../api/types';
import { DailyLatencyChart } from '../components/DailyLatencyChart';
import { DailyUptimeChart } from '../components/DailyUptimeChart';
import { LatencyChart } from '../components/LatencyChart';
import { ThemeToggle } from '../components/ui';

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return `${v.toFixed(3)}%`;
}

function formatSec(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60);
  const s = v % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export function AdminAnalytics() {
  const { logout } = useAuth();

  const [overviewRange, setOverviewRange] = useState<AnalyticsOverviewRange>('24h');
  const [monitorRange, setMonitorRange] = useState<AnalyticsRange>('24h');
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['admin-analytics-overview', overviewRange],
    queryFn: () => fetchAdminAnalyticsOverview(overviewRange),
  });

  const monitorsQuery = useQuery({
    queryKey: ['admin-monitors', 'for-analytics'],
    queryFn: () => fetchAdminMonitors(200),
  });

  const monitors = useMemo(() => monitorsQuery.data?.monitors ?? [], [monitorsQuery.data?.monitors]);

  useEffect(() => {
    if (selectedMonitorId !== null) return;
    const first = monitors[0];
    if (first) setSelectedMonitorId(first.id);
  }, [monitors, selectedMonitorId]);

  const selectedMonitor = useMemo(() => monitors.find((m) => m.id === selectedMonitorId) ?? null, [monitors, selectedMonitorId]);

  const monitorAnalyticsQuery = useQuery({
    queryKey: ['admin-monitor-analytics', selectedMonitorId, monitorRange],
    queryFn: () => fetchAdminMonitorAnalytics(selectedMonitorId as number, monitorRange),
    enabled: selectedMonitorId !== null,
  });

  const outagesQuery = useInfiniteQuery({
    queryKey: ['admin-monitor-outages', selectedMonitorId, monitorRange],
    queryFn: ({ pageParam }) => {
      const opts: { range: AnalyticsRange; limit: number; cursor?: number } = { range: monitorRange, limit: 50 };
      if (typeof pageParam === 'number') opts.cursor = pageParam;
      return fetchAdminMonitorOutages(selectedMonitorId as number, opts);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: selectedMonitorId !== null,
  });

  const outages = outagesQuery.data?.pages.flatMap((p) => p.outages) ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 shadow-sm dark:shadow-none dark:border-b dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex justify-between items-center">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100">Analytics</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link to="/admin" className="flex items-center justify-center h-9 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors px-3 rounded-lg">
              <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link to="/" className="flex items-center justify-center h-9 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors px-3 rounded-lg">
              <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="hidden sm:inline">Status</span>
            </Link>
            <button onClick={logout} className="flex items-center justify-center h-9 text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors px-3 rounded-lg">
              <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-6 sm:space-y-10">
        {/* Overview */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-none dark:border dark:border-slate-700 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Overview</h2>
            <div className="flex gap-2">
              {(['24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setOverviewRange(r)}
                  className={`px-3 py-1.5 rounded text-sm ${overviewRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {overviewQuery.isLoading ? (
            <div className="mt-4 text-gray-500 dark:text-slate-400">Loading...</div>
          ) : overviewQuery.data ? (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                <div className="text-xs text-gray-500 dark:text-slate-400">Uptime</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPct(overviewQuery.data.totals.uptime_pct)}</div>
              </div>
              <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                <div className="text-xs text-gray-500 dark:text-slate-400">Downtime</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatSec(overviewQuery.data.totals.downtime_sec)}</div>
              </div>
              <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                <div className="text-xs text-gray-500 dark:text-slate-400">Alerts</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{overviewQuery.data.alerts.count}</div>
              </div>
              <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                <div className="text-xs text-gray-500 dark:text-slate-400">MTTR</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{overviewQuery.data.outages.mttr_sec === null ? '-' : formatSec(overviewQuery.data.outages.mttr_sec)}</div>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-gray-500 dark:text-slate-400">Failed to load overview</div>
          )}
        </section>

        {/* Monitor */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-none dark:border dark:border-slate-700 p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Monitor</h2>

            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedMonitorId ?? ''}
                onChange={(e) => setSelectedMonitorId(e.target.value ? Number(e.target.value) : null)}
                className="border dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="" disabled>
                  Select a monitor…
                </option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (#{m.id})
                  </option>
                ))}
              </select>

              <select
                value={monitorRange}
                onChange={(e) => setMonitorRange(e.target.value as AnalyticsRange)}
                className="border dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                {(['24h', '7d', '30d', '90d'] as const).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {monitorAnalyticsQuery.isLoading ? (
            <div className="text-gray-500 dark:text-slate-400">Loading…</div>
          ) : !monitorAnalyticsQuery.data ? (
            <div className="text-gray-500 dark:text-slate-400">Select a monitor to view analytics</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                  <div className="text-xs text-gray-500 dark:text-slate-400">Uptime</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPct(monitorAnalyticsQuery.data.uptime_pct)}</div>
                </div>
                <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                  <div className="text-xs text-gray-500 dark:text-slate-400">Unknown</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatPct(monitorAnalyticsQuery.data.unknown_pct)}</div>
                </div>
                <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                  <div className="text-xs text-gray-500 dark:text-slate-400">P95 Latency</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {monitorAnalyticsQuery.data.p95_latency_ms === null ? '-' : `${monitorAnalyticsQuery.data.p95_latency_ms}ms`}
                  </div>
                </div>
                <div className="p-4 border dark:border-slate-600 rounded bg-white dark:bg-slate-700/50">
                  <div className="text-xs text-gray-500 dark:text-slate-400">P50 Latency</div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {monitorAnalyticsQuery.data.p50_latency_ms === null ? '-' : `${monitorAnalyticsQuery.data.p50_latency_ms}ms`}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="border dark:border-slate-600 rounded p-4 bg-white dark:bg-slate-700/50">
                  <div className="text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">Uptime (Daily)</div>
                  {monitorRange === '24h' ? (
                    <div className="text-sm text-gray-500 dark:text-slate-400 h-[220px] flex items-center justify-center">
                      Daily rollup charts are available for 7d/30d/90d
                    </div>
                  ) : (
                    <DailyUptimeChart points={monitorAnalyticsQuery.data.daily} />
                  )}
                </div>
                <div className="border dark:border-slate-600 rounded p-4 bg-white dark:bg-slate-700/50">
                  <div className="text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">Latency</div>
                  {monitorRange === '24h' ? (
                    <LatencyChart points={monitorAnalyticsQuery.data.points} />
                  ) : (
                    <DailyLatencyChart points={monitorAnalyticsQuery.data.daily} />
                  )}
                </div>
              </div>

              <div className="border dark:border-slate-600 rounded p-3 sm:p-4 bg-white dark:bg-slate-700/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Outages</div>
                  {selectedMonitor && (
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      {selectedMonitor.name} (#{selectedMonitor.id})
                    </div>
                  )}
                </div>

                {outagesQuery.isLoading ? (
                  <div className="mt-3 text-gray-500 dark:text-slate-400">Loading outages…</div>
                ) : outages.length === 0 ? (
                  <div className="mt-3 text-gray-500 dark:text-slate-400">No outages in this range</div>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="text-xs text-gray-500 dark:text-slate-400">
                        <tr>
                          <th className="text-left py-2 pr-4">Start</th>
                          <th className="text-left py-2 pr-4">End</th>
                          <th className="text-left py-2 pr-4">Initial error</th>
                          <th className="text-left py-2 pr-4">Last error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-slate-600">
                        {outages.map((o) => (
                          <tr key={o.id}>
                            <td className="py-2 pr-4 whitespace-nowrap text-slate-900 dark:text-slate-100">{new Date(o.started_at * 1000).toLocaleString()}</td>
                            <td className="py-2 pr-4 whitespace-nowrap text-slate-900 dark:text-slate-100">{o.ended_at ? new Date(o.ended_at * 1000).toLocaleString() : 'Ongoing'}</td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-slate-400">{o.initial_error ?? '-'}</td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-slate-400">{o.last_error ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {outagesQuery.hasNextPage && (
                      <div className="mt-4">
                        <button
                          onClick={() => outagesQuery.fetchNextPage()}
                          disabled={outagesQuery.isFetchingNextPage}
                          className="px-3 py-2 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50"
                        >
                          {outagesQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
