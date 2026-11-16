import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GameAnalyticsDashboard } from '@sorc/analytics-ui'
import type { CardMetadata } from '@sorc/analytics-ui/card-table'
import './page.css'

const PSO = 'https://playsorceryonline.com'

interface CatalogCard extends CardMetadata { imageUrl?: string }

function App() {
  const [catalog, setCatalog] = useState<CatalogCard[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/catalog/cards')
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<CatalogCard[]> })
      .then((cards) => setCatalog(cards.map((card) => card.imageUrl?.startsWith('/') ? { ...card, imageUrl: `${PSO}${card.imageUrl}` } : card)))
      .catch(() => setCatalogError('The card catalog could not be loaded.'))
  }, [])
  return <>
    <p className="dev-banner">
      {__PSO_DATA_MODE__ === 'live'
        ? 'Live PSO data through your key (all games together).'
        : 'Fixture data: made-up games, and filters do not change the numbers. Add PSO_API_KEY to .env.local for live data.'}
    </p>
    <GameAnalyticsDashboard endpoint="/api/analytics" replayBaseUrl={`${PSO}/replays`}
      catalog={catalog} catalogError={catalogError} siteOpenings />
  </>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
