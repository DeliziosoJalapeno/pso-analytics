import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

// Answers the analytics routes from fixtures/ so the UI runs with no key and no network.
// Responses ignore the filters you pick; they are captured from PSO's real aggregation code over
// made-up games, so the numbers are plausible but mean nothing. With a key, the analytics routes (and
// the catalog) come from PSO's public API; card replay clips stay empty because the API doesn't serve them.

const ROOT = path.resolve(import.meta.dirname, '../../fixtures')
const ROUTES: Array<[RegExp, string]> = [
  [/^\/api\/analytics\/cards\/[^/]+\/replays$/, ''],
  [/^\/api\/analytics\/cards$/, 'api/constructed/cards.json'],
  [/^\/api\/analytics\/meta$/, 'api/constructed/meta.json'],
  [/^\/api\/analytics\/query-options$/, 'api/constructed/query-options.json'],
  [/^\/api\/analytics\/site-openings$/, 'api/constructed/site-openings.json'],
  [/^\/api\/analytics\/cohort$/, 'api/constructed/cohort.json'],
  [/^\/api\/catalog\/cards$/, 'catalog.json'],
]

function send(response: ServerResponse, status: number, body: string) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(body)
}

/** Local path the dashboard calls -> PSO public API path, used by the dev proxy when there is a key. */
export const LIVE_ROUTES: Record<string, string> = {
  '/api/analytics/cards': '/api/v1/analytics/cards',
  '/api/analytics/meta': '/api/v1/analytics/meta',
  '/api/analytics/site-openings': '/api/v1/analytics/site-openings',
  '/api/analytics/query-options': '/api/v1/analytics/query-options',
  '/api/analytics/cohort': '/api/v1/analytics/query',
  '/api/usage': '/api/v1/usage',
  '/api/catalog/cards': '/api/catalog/cards',
}
export const LIVE_PATHS = Object.keys(LIVE_ROUTES)

export function fixtureServer({ live }: { live: boolean }): Plugin {
  return {
    name: 'pso-analytics-fixtures',
    configureServer(server) {
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        if (live && LIVE_PATHS.includes(url.pathname)) return next()
        const match = ROUTES.find(([pattern]) => pattern.test(url.pathname))
        if (!match) return next()
        if (!match[1]) return send(response, 200, JSON.stringify({ replays: [] }))
        send(response, 200, readFileSync(path.join(ROOT, match[1]), 'utf8'))
      })
    },
  }
}
