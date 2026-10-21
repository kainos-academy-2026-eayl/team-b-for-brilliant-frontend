/**
 * Like Promise.all(items.map(mapper)), but never runs more than `concurrency`
 * mappers at the same time. Results keep the same order as `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `concurrency must be a positive integer, got ${concurrency}`,
    )
  }

  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index] as T, index)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, worker))

  return results
}
