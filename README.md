# Simple Pokedex

Full-stack sample that wraps PokeAPI with an Express cache layer and a lightweight React UI.

## Run locally

Backend
```bash
cd Project
npm install
npm run dev
```
Frontend (new terminal)
```bash
cd Project/frontend
npm install
npm run dev
```
Open the Vite URL (usually http://localhost:5173). Calls to `/api/*` proxy to http://localhost:4000.

## API
- GET /api/health
- GET /api/pokemon/:identifier (name or id)
- GET /api/pokemon?name=bulbasaur

## Env
- PORT (default 4000)
- CACHE_TTL_MS (default 300000)
- CACHE_MAX_ENTRIES (default 80)
- POKE_API_BASE (override pokeapi base)
- VITE_API_BASE_URL (for builds; dev uses proxy)
