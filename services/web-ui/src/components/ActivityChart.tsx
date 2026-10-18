import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ActivityBucket } from '../api/types';
import { CHART_COLORS } from '../theme';
import { formatClock, formatInstant, formatNumber } from './format';

interface ActivityChartProps {
  buckets: ActivityBucket[];
}

/**
 * Readings per hour over the last day.
 *
 * <p>The service returns quiet hours explicitly as zero, so a gap in reporting shows up as a run of
 * empty bars rather than being smoothed over by the chart.
 */
export function ActivityChart({ buckets }: ActivityChartProps) {
  const data = buckets.map((bucket) => ({
    time: new Date(bucket.start).getTime(),
    iso: bucket.start,
    count: bucket.count,
  }));

  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const busiest = buckets.reduce<ActivityBucket | null>(
    (best, bucket) => (best === null || bucket.count > best.count ? bucket : best),
    null,
  );

  return (
    <>
      <p className="mb-space-md font-body-md text-body-md text-on-surface-variant">
        {total === 0
          ? 'No readings arrived in the last 24 hours.'
          : `${formatNumber(total)} readings in the last 24 hours` +
            (busiest && busiest.count > 0 ? `, busiest around ${formatClock(busiest.start)}.` : '.')}
      </p>
      <div className="rounded-xl bg-surface-container-low p-1.5 pb-0">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={(value: number) => formatClock(new Date(value).toISOString())}
              stroke={CHART_COLORS.outline}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              minTickGap={28}
            />
            <YAxis
              stroke={CHART_COLORS.outline}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: CHART_COLORS.surfaceContainerHigh }}
              contentStyle={{
                background: CHART_COLORS.surfaceContainerLowest,
                border: `1px solid ${CHART_COLORS.surfaceContainerHigh}`,
                borderRadius: 10,
                color: CHART_COLORS.onSurface,
              }}
              labelFormatter={(value) => formatInstant(new Date(Number(value)).toISOString())}
              formatter={(value: number) => [formatNumber(value), 'Readings']}
            />
            <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
