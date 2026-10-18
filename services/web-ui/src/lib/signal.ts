/**
 * Small, dependency-free signal-processing helpers. Everything here is textbook math applied to
 * whatever real numbers are handed in — there is no model and nothing simulated; the same formula
 * run on different input would give a different, equally real answer.
 */

export interface SpectrumBin {
  /** Cycles per hour, derived from the real average sampling interval of the input series. */
  cyclesPerHour: number;
  magnitude: number;
}

/**
 * Resamples an irregularly-timestamped series onto `count` evenly-spaced instants across its own
 * real time span, by linear interpolation. A DFT assumes uniform sampling; IoT readings rarely
 * arrive on a fixed clock, so this is the honest way to give the transform a grid to work with
 * without inventing values outside the series' own observed range.
 */
export function resampleUniform(points: { timestamp: string; value: number }[], count: number): number[] {
  if (points.length < 2) {
    return points.map((point) => point.value);
  }
  const times = points.map((point) => new Date(point.timestamp).getTime());
  const start = times[0];
  const end = times[times.length - 1];
  if (end === start) {
    return points.map((point) => point.value);
  }

  const output: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = start + (i / (count - 1)) * (end - start);
    let j = 0;
    while (j < times.length - 2 && times[j + 1] < t) {
      j += 1;
    }
    const t0 = times[j];
    const t1 = times[j + 1];
    const v0 = points[j].value;
    const v1 = points[j + 1].value;
    const fraction = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    output.push(v0 + (v1 - v0) * fraction);
  }
  return output;
}

/**
 * A plain O(n²) discrete Fourier transform — fine at the small N (a few dozen points) this console
 * ever feeds it. Returns magnitude per frequency bin up to the Nyquist limit, labeled in cycles per
 * hour using the series' own real average sampling interval.
 */
export function discreteFourierTransform(
  values: number[],
  points: { timestamp: string; value: number }[],
): SpectrumBin[] {
  const n = values.length;
  if (n < 4) {
    return [];
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const centered = values.map((value) => value - mean);

  const times = points.map((point) => new Date(point.timestamp).getTime());
  const spanHours = (times[times.length - 1] - times[0]) / 3_600_000;
  const sampleRateHours = spanHours > 0 ? (n - 1) / spanHours : 1;

  const bins: SpectrumBin[] = [];
  const nyquist = Math.floor(n / 2);
  for (let k = 1; k <= nyquist; k += 1) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (2 * Math.PI * k * t) / n;
      re += centered[t] * Math.cos(angle);
      im -= centered[t] * Math.sin(angle);
    }
    const magnitude = Math.sqrt(re * re + im * im) / n;
    bins.push({ cyclesPerHour: (k / n) * sampleRateHours, magnitude });
  }
  return bins;
}

export interface Moments {
  mean: number;
  stddev: number;
  /** Third standardized moment — asymmetry of the distribution. 0 is symmetric. */
  skewness: number;
  /** Fourth standardized moment minus 3 — excess kurtosis. 0 matches a normal distribution. */
  kurtosis: number;
}

export function computeMoments(values: number[]): Moments {
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) {
    return { mean, stddev: 0, skewness: 0, kurtosis: 0 };
  }
  const skewness = values.reduce((sum, value) => sum + ((value - mean) / stddev) ** 3, 0) / n;
  const kurtosis = values.reduce((sum, value) => sum + ((value - mean) / stddev) ** 4, 0) / n - 3;
  return { mean, stddev, skewness, kurtosis };
}

/** Pearson correlation coefficient between two equal-length real series, -1..1. */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) {
    return 0;
  }
  const meanA = a.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) {
    return 0;
  }
  return cov / Math.sqrt(varA * varB);
}

/**
 * Simple moving average over `window` samples. Positions before a full window are returned as null
 * rather than averaged over fewer points, which would draw a line the data does not support.
 */
export function rollingMean(values: number[], window: number): (number | null)[] {
  if (window < 1) {
    return values.map(() => null);
  }
  const output: (number | null)[] = [];
  let running = 0;
  for (let i = 0; i < values.length; i += 1) {
    running += values[i];
    if (i >= window) {
      running -= values[i - window];
    }
    output.push(i >= window - 1 ? running / window : null);
  }
  return output;
}

export interface Trend {
  /** Change in the measured value per hour. */
  slopePerHour: number;
  /** Value the fitted line takes at the most recent sample. */
  latestFitted: number;
  /** Coefficient of determination, 0-1: how much of the variance the straight line explains. */
  rSquared: number;
}

/**
 * Ordinary least-squares fit of value against time. This is a description of the window it is given,
 * not a forecast model: it says how the series has moved, and `projectHoursToThreshold` extends that
 * same straight line, nothing more.
 */
export function linearTrend(points: { timestamp: string; value: number }[]): Trend | null {
  const n = points.length;
  if (n < 3) {
    return null;
  }

  const times = points.map((point) => new Date(point.timestamp).getTime() / 3_600_000);
  const values = points.map((point) => point.value);
  const meanTime = times.reduce((sum, value) => sum + value, 0) / n;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / n;

  let covariance = 0;
  let varianceTime = 0;
  for (let i = 0; i < n; i += 1) {
    covariance += (times[i] - meanTime) * (values[i] - meanValue);
    varianceTime += (times[i] - meanTime) ** 2;
  }
  if (varianceTime === 0) {
    return null;
  }

  const slopePerHour = covariance / varianceTime;
  const intercept = meanValue - slopePerHour * meanTime;

  let residual = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    residual += (values[i] - (intercept + slopePerHour * times[i])) ** 2;
    total += (values[i] - meanValue) ** 2;
  }

  return {
    slopePerHour,
    latestFitted: intercept + slopePerHour * times[times.length - 1],
    rSquared: total === 0 ? 0 : Math.max(0, 1 - residual / total),
  };
}

/**
 * Hours until the fitted straight line reaches `threshold`, or null when it is already past it or
 * moving away. Deliberately a linear extrapolation and nothing more — no failure distribution is
 * fitted, because this platform records no failures to fit one to.
 */
export function projectHoursToThreshold(trend: Trend, latest: number, threshold: number): number | null {
  const gap = threshold - latest;
  if (gap <= 0 || trend.slopePerHour <= 0) {
    return null;
  }
  return gap / trend.slopePerHour;
}

/** Spearman's rank correlation — Pearson applied to the ranks, so monotone but non-linear agreement still shows. */
export function spearmanCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) {
    return 0;
  }
  const rank = (values: number[]): number[] => {
    const indexed = values.slice(0, n).map((value, index) => ({ value, index }));
    indexed.sort((left, right) => left.value - right.value);
    const ranks = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      // Ties share the mean of the positions they span, which keeps the coefficient unbiased.
      let j = i;
      while (j + 1 < n && indexed[j + 1].value === indexed[i].value) {
        j += 1;
      }
      const shared = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) {
        ranks[indexed[k].index] = shared;
      }
      i = j;
    }
    return ranks;
  };
  return pearsonCorrelation(rank(a), rank(b));
}

export interface LaggedCorrelation {
  /** Samples b is shifted by; negative means b leads a. */
  lag: number;
  coefficient: number;
}

/**
 * The shift at which two series correlate most strongly, searched over ±maxLag samples. Answers "does
 * one of these move first", using only the real samples — no interpolation beyond the shared grid.
 */
export function bestLagCorrelation(a: number[], b: number[], maxLag: number): LaggedCorrelation {
  let best: LaggedCorrelation = { lag: 0, coefficient: pearsonCorrelation(a, b) };
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    if (lag === 0) {
      continue;
    }
    const left = lag > 0 ? a.slice(lag) : a.slice(0, a.length + lag);
    const right = lag > 0 ? b.slice(0, b.length - lag) : b.slice(-lag);
    if (left.length < 3 || right.length < 3) {
      continue;
    }
    const coefficient = pearsonCorrelation(left, right);
    if (Math.abs(coefficient) > Math.abs(best.coefficient)) {
      best = { lag, coefficient };
    }
  }
  return best;
}

/**
 * Ratio of the second half's variance to the first half's. A value near 1 means the spread is stable
 * across the window; far from 1 means the signal's noise level itself changed.
 */
export function varianceRatio(values: number[]): number | null {
  if (values.length < 6) {
    return null;
  }
  const middle = Math.floor(values.length / 2);
  const spread = (sample: number[]) => {
    const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    return sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sample.length;
  };
  const first = spread(values.slice(0, middle));
  const second = spread(values.slice(middle));
  if (first === 0) {
    return null;
  }
  return second / first;
}

/**
 * Total harmonic distortion of a real spectrum: the energy outside the strongest component, relative
 * to it. Reported as a fraction, so 0.09 is 9%.
 */
export function harmonicDistortion(spectrum: SpectrumBin[]): number | null {
  if (spectrum.length < 2) {
    return null;
  }
  const fundamental = spectrum.reduce((best, bin) => (bin.magnitude > best.magnitude ? bin : best), spectrum[0]);
  if (fundamental.magnitude === 0) {
    return null;
  }
  const rest = spectrum
    .filter((bin) => bin !== fundamental)
    .reduce((sum, bin) => sum + bin.magnitude ** 2, 0);
  return Math.sqrt(rest) / fundamental.magnitude;
}

/**
 * Standard score of `latest` against a real prior-history sample — the same "how far from its own
 * baseline" question `useDeviationRadar` asks, factored out so other views can ask it of a single
 * value (e.g. the reading that tripped an anomaly) rather than a whole axis.
 */
export function zScoreAgainstHistory(latest: number, history: number[]): number {
  if (history.length === 0) {
    return 0;
  }
  const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
  const variance = history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / history.length;
  const stddev = Math.sqrt(variance);
  return stddev === 0 ? 0 : (latest - mean) / stddev;
}
