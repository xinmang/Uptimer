import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Heartbeat, CheckStatus } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { statusLabel } from '../i18n/labels';
import { clampLatencyToCeiling, suggestLatencyAxisCeiling } from '../utils/latencyScale';

interface HeartbeatBarProps {
  heartbeats: Heartbeat[];
  maxBars?: number;
  visualBars?: number;
  density?: 'default' | 'compact';
}

function getStatusColor(status: CheckStatus): string {
  switch (status) {
    case 'up':
      return 'bg-emerald-500 dark:bg-emerald-400';
    case 'down':
      return 'bg-red-500 dark:bg-red-400';
    case 'maintenance':
      return 'bg-blue-500 dark:bg-blue-400';
    case 'unknown':
    default:
      return 'bg-slate-300 dark:bg-slate-600';
  }
}

function getStatusGlow(status: CheckStatus): string {
  switch (status) {
    case 'up':
      return 'shadow-emerald-500/50';
    case 'down':
      return 'shadow-red-500/50';
    default:
      return '';
  }
}

interface LatencyScale {
  min: number;
  span: number;
  ceiling: number | null;
}

interface DisplayHeartbeat extends Heartbeat {
  from_checked_at: number;
  to_checked_at: number;
  sample_count: number;
}

function buildLatencyScale(heartbeats: DisplayHeartbeat[]): LatencyScale | null {
  const latencies: number[] = [];
  for (const hb of heartbeats) {
    if (hb.status !== 'up') continue;
    if (typeof hb.latency_ms !== 'number' || !Number.isFinite(hb.latency_ms)) continue;
    latencies.push(hb.latency_ms);
  }

  if (latencies.length === 0) return null;

  const ceiling = suggestLatencyAxisCeiling(latencies);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const latency of latencies) {
    const display = clampLatencyToCeiling(latency, ceiling);
    if (display < min) min = display;
    if (display > max) max = display;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, span: Math.max(1, max - min), ceiling };
}

function getBarHeight(
  heartbeat: DisplayHeartbeat,
  scale: LatencyScale | null,
  compact: boolean,
): string {
  if (heartbeat.status === 'down') return '100%';
  if (heartbeat.status === 'maintenance') return compact ? '62%' : '65%';
  if (heartbeat.status === 'unknown') return compact ? '48%' : '52%';

  if (heartbeat.latency_ms === null || !scale) return compact ? '74%' : '78%';

  const displayLatency = clampLatencyToCeiling(heartbeat.latency_ms, scale.ceiling);
  const normalized = (displayLatency - scale.min) / scale.span;
  const clamped = Math.max(0, Math.min(1, normalized));
  const minHeight = compact ? 36 : 38;
  const pct = minHeight + clamped * (100 - minHeight);
  return `${pct.toFixed(1)}%`;
}

function formatTime(timestamp: number, locale: string): string {
  return new Date(timestamp * 1000).toLocaleString(locale);
}

interface TooltipProps {
  heartbeat: DisplayHeartbeat;
  position: { x: number; y: number };
}

function Tooltip({ heartbeat, position }: TooltipProps) {
  const { locale, t } = useI18n();
  const hasWindow =
    heartbeat.sample_count > 1 && heartbeat.from_checked_at !== heartbeat.to_checked_at;

  return (
    <div
      className="fixed z-50 px-3 py-2 text-xs bg-slate-900 dark:bg-slate-700 text-white rounded-lg shadow-lg pointer-events-none animate-fade-in"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      <div className="font-medium mb-1">
        {hasWindow
          ? `${formatTime(heartbeat.from_checked_at, locale)} ${t('heartbeat.to')} ${formatTime(heartbeat.to_checked_at, locale)}`
          : formatTime(heartbeat.checked_at, locale)}
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${getStatusColor(heartbeat.status)}`} />
        <span>{statusLabel(heartbeat.status, t)}</span>
        {heartbeat.latency_ms !== null && (
          <span className="text-slate-400 dark:text-slate-300">• {heartbeat.latency_ms}ms</span>
        )}
      </div>
      {heartbeat.sample_count > 1 && (
        <div className="mt-1 text-slate-300">
          {t('heartbeat.sample_checks', { count: heartbeat.sample_count })}
        </div>
      )}
      <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-slate-900 dark:bg-slate-700 rotate-45" />
    </div>
  );
}

function statusPriority(status: CheckStatus): number {
  switch (status) {
    case 'down':
      return 4;
    case 'unknown':
      return 3;
    case 'maintenance':
      return 2;
    case 'up':
    default:
      return 1;
  }
}

function aggregateHeartbeats(heartbeats: Heartbeat[], slots: number): DisplayHeartbeat[] {
  if (heartbeats.length === 0) return [];

  const chronological = [...heartbeats].reverse();
  if (slots >= chronological.length) {
    return chronological.map((hb) => ({
      ...hb,
      from_checked_at: hb.checked_at,
      to_checked_at: hb.checked_at,
      sample_count: 1,
    }));
  }

  const groupSize = Math.ceil(chronological.length / slots);
  const groups: DisplayHeartbeat[] = [];

  for (let start = 0; start < chronological.length; start += groupSize) {
    const endExclusive = Math.min(chronological.length, start + groupSize);
    const first = chronological[start];
    const last = chronological[endExclusive - 1];
    if (!first || !last) continue;

    let worst = first;
    let latencySum = 0;
    let latencyCount = 0;
    for (let i = start; i < endExclusive; i++) {
      const hb = chronological[i];
      if (!hb) continue;

      if (statusPriority(hb.status) > statusPriority(worst.status)) {
        worst = hb;
      }

      if (
        hb.status === 'up' &&
        typeof hb.latency_ms === 'number' &&
        Number.isFinite(hb.latency_ms)
      ) {
        latencySum += hb.latency_ms;
        latencyCount++;
      }
    }

    const avgLatency = latencyCount > 0 ? Math.round(latencySum / latencyCount) : null;

    groups.push({
      checked_at: last.checked_at,
      status: worst.status,
      latency_ms: avgLatency,
      from_checked_at: first.checked_at,
      to_checked_at: last.checked_at,
      sample_count: endExclusive - start,
    });
  }

  return groups;
}

export function HeartbeatBar({
  heartbeats,
  maxBars = 60,
  visualBars,
  density = 'default',
}: HeartbeatBarProps) {
  const { locale, t } = useI18n();
  const [tooltip, setTooltip] = useState<{
    heartbeat: DisplayHeartbeat;
    position: { x: number; y: number };
  } | null>(null);
  const compact = density === 'compact';

  const sourceHeartbeats = useMemo(() => heartbeats.slice(0, maxBars), [heartbeats, maxBars]);
  const slotCount = useMemo(() => {
    if (!visualBars || visualBars < 1) return maxBars;
    return Math.min(maxBars, visualBars);
  }, [maxBars, visualBars]);
  const displayHeartbeats = useMemo(
    () => aggregateHeartbeats(sourceHeartbeats, slotCount),
    [sourceHeartbeats, slotCount],
  );
  const latencyScale = useMemo(() => buildLatencyScale(displayHeartbeats), [displayHeartbeats]);

  const handleMouseEnter = (hb: DisplayHeartbeat, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      heartbeat: hb,
      position: { x: rect.left + rect.width / 2, y: rect.top },
    });
  };

  return (
    <>
      <div
        data-bar-chart
        className={
          compact
            ? 'flex h-5 items-end gap-[2px] sm:h-6'
            : 'flex h-6 items-end gap-[2px] sm:h-8 sm:gap-[3px]'
        }
      >
        {displayHeartbeats.map((hb) => (
          <div
            key={`${hb.from_checked_at}-${hb.to_checked_at}`}
            role="img"
            aria-label={`${statusLabel(hb.status, t)} ${formatTime(hb.from_checked_at, locale)}${hb.to_checked_at !== hb.from_checked_at ? ` ${t('heartbeat.to')} ${formatTime(hb.to_checked_at, locale)}` : ''}${hb.latency_ms !== null ? ` ${hb.latency_ms}ms` : ''}`}
            className={`${
              compact
                ? 'max-w-[6px] min-w-[3px] flex-1'
                : 'max-w-[6px] min-w-[3px] flex-1 sm:max-w-[8px] sm:min-w-[4px]'
            } rounded-sm transition-all duration-150 cursor-pointer
              ${getStatusColor(hb.status)}
              ${compact ? 'hover:scale-y-105' : 'hover:scale-y-110'} hover:shadow-md ${tooltip?.heartbeat === hb ? getStatusGlow(hb.status) : ''}`}
            style={{ height: getBarHeight(hb, latencyScale, compact) }}
            onMouseEnter={(e) => handleMouseEnter(hb, e)}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        {displayHeartbeats.length < slotCount &&
          Array.from({ length: slotCount - displayHeartbeats.length }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className={
                compact
                  ? 'h-[46%] max-w-[6px] min-w-[3px] flex-1 rounded-sm bg-slate-200 dark:bg-slate-700'
                  : 'h-[48%] max-w-[6px] min-w-[3px] flex-1 rounded-sm bg-slate-200 dark:bg-slate-700 sm:max-w-[8px] sm:min-w-[4px]'
              }
            />
          ))}
      </div>
      {tooltip &&
        createPortal(
          <Tooltip heartbeat={tooltip.heartbeat} position={tooltip.position} />,
          document.body,
        )}
    </>
  );
}
