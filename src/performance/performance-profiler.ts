/**
 * Stable phases exposed by the CLI and generated report performance harness.
 */
export const PERFORMANCE_PHASES = [
  "discovery",
  "reading",
  "line-analysis",
  "parsing",
  "resolution",
  "coverage",
  "html-packaging",
  "report-writing",
  "browser-presentation",
  "browser-findings",
  "browser-layout",
] as const

/** One separately measurable product phase. */
export type PerformancePhase = (typeof PERFORMANCE_PHASES)[number]

/** Aggregated elapsed time for one phase. */
export type PerformanceMeasurement = {
  readonly phase: PerformancePhase
  readonly durationMilliseconds: number
}

/**
 * Low-overhead additive phase profiler shared by Node and browser code.
 *
 * Repeated operations such as per-file parsing are accumulated under one phase
 * so callers do not need to retain per-file timing records.
 */
export class PerformanceProfiler {
  readonly #durations = new Map<PerformancePhase, number>()

  /**
   * Measure a synchronous operation and add its duration to the phase total.
   *
   * @template T - Operation result.
   * @param phase - Product phase that owns the operation.
   * @param operation - Work to measure.
   * @returns The operation result.
   */
  public measure<T>(phase: PerformancePhase, operation: () => T): T {
    const startedAt = performance.now()
    try {
      return operation()
    } finally {
      this.#add(phase, performance.now() - startedAt)
    }
  }

  /**
   * Measure an asynchronous operation and add its duration to the phase total.
   *
   * @template T - Operation result.
   * @param phase - Product phase that owns the operation.
   * @param operation - Work to measure.
   * @returns The awaited operation result.
   */
  public async measureAsync<T>(phase: PerformancePhase, operation: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()
    try {
      return await operation()
    } finally {
      this.#add(phase, performance.now() - startedAt)
    }
  }

  /**
   * Return deterministic aggregated measurements in stable phase order.
   *
   * @returns A snapshot safe to serialize into benchmark evidence.
   */
  public measurements(): readonly PerformanceMeasurement[] {
    return PERFORMANCE_PHASES.flatMap((phase) => {
      const durationMilliseconds = this.#durations.get(phase)
      return durationMilliseconds === undefined ? [] : [{ phase, durationMilliseconds }]
    })
  }

  #add(phase: PerformancePhase, durationMilliseconds: number): void {
    this.#durations.set(phase, (this.#durations.get(phase) ?? 0) + durationMilliseconds)
  }
}
