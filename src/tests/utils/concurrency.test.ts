import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from '../../utils/concurrency'

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

describe('mapWithConcurrency', () => {
  it('never runs more than the given number of mappers at once', async () => {
    let active = 0
    let peak = 0

    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        active++
        peak = Math.max(peak, active)
        await delay(1)
        active--
      },
    )

    expect(peak).toBe(3)
  })

  it('keeps results in input order even when mappers finish out of order', async () => {
    const results = await mapWithConcurrency([30, 10, 20, 0], 2, async (milliseconds) => {
      await delay(milliseconds)
      return milliseconds
    })

    expect(results).toEqual([30, 10, 20, 0])
  })

  it('returns an empty array for no items', async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([])
  })

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects an invalid concurrency of %s',
    async (concurrency) => {
      await expect(
        mapWithConcurrency([1], concurrency, async () => 1),
      ).rejects.toThrow(RangeError)
    },
  )
})
