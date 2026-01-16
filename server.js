const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const app = express();

const CONFIG = {
  port: Number(process.env.PORT ?? 4000),
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 1000 * 60 * 5),
  cacheMaxEntries: Number(process.env.CACHE_MAX_ENTRIES ?? 80),
  pokeApiBase: process.env.POKE_API_BASE ?? "https://pokeapi.co/api/v2",
};

app.use(
  helmet({
    // Allow external images (e.g., PokeAPI artwork) to load.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Disable COEP so image hosts without CORS headers still render.
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

// in-memory LRU-ish cache
const cache = new Map();

function normalizeKey(value) {
  return value?.trim().toLowerCase() ?? "";
}

function evictIfNeeded() {
  if (cache.size <= CONFIG.cacheMaxEntries) return;
  let lruKey = null;
  let oldest = Infinity;
  for (const [key, entry] of cache.entries()) {
    if (entry.lastAccessed < oldest) {
      oldest = entry.lastAccessed;
      lruKey = key;
    }
  }
  if (lruKey) cache.delete(lruKey);
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function getFromCache(key) {
  const normalized = normalizeKey(key);
  const entry = cache.get(normalized);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(normalized);
    return null;
  }
  entry.lastAccessed = Date.now();
  return entry;
}

function setCache(key, value) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  evictIfNeeded();
  const now = Date.now();
  cache.set(normalized, {
    value,
    createdAt: now,
    lastAccessed: now,
    expiresAt: now + CONFIG.cacheTtlMs,
  });
}

setInterval(pruneExpired, CONFIG.cacheTtlMs).unref?.();

async function fetchJson(url, label) {
  const res = await fetch(url);
  if (res.status === 404)
    throw new HttpError(404, "Pokemon not found", { source: label });
  if (!res.ok) throw new HttpError(502, `Pokemon service failed for ${label}`);
  return res.json();
}

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pickFlavor(species) {
  const entry = species?.flavor_text_entries?.find(
    (item) => item.language?.name === "en"
  );
  return (
    entry?.flavor_text?.replace(/\s+/g, " ")?.trim() ?? "No description yet."
  );
}

function buildView(pokemon, species) {
  const stats = pokemon.stats.map(({ base_stat, stat }) => ({
    key: stat.name,
    label: capitalize(stat.name.replace("-", " ")),
    value: base_stat,
  }));

  const artwork =
    pokemon.sprites?.other?.["official-artwork"]?.front_default ??
    pokemon.sprites?.other?.home?.front_default ??
    pokemon.sprites?.front_default ??
    null;

  return {
    id: pokemon.id,
    slug: pokemon.name,
    name: capitalize(pokemon.name),
    displayId: `#${String(pokemon.id).padStart(4, "0")}`,
    flavorText: pickFlavor(species),
    types: pokemon.types.map((t) => capitalize(t.type.name)),
    sprites: {
      artwork,
      default: pokemon.sprites?.front_default ?? artwork,
      shiny: pokemon.sprites?.front_shiny ?? null,
    },
    height: Number((pokemon.height * 0.1).toFixed(2)),
    weight: Number((pokemon.weight * 0.1).toFixed(2)),
    baseExperience: pokemon.base_experience,
    stats,
    abilities: pokemon.abilities.map(({ ability, is_hidden }) => ({
      name: capitalize(ability.name),
      isHidden: Boolean(is_hidden),
    })),
    habitat: species?.habitat?.name
      ? capitalize(species.habitat.name)
      : "Unknown",
    color: species?.color?.name ? capitalize(species.color.name) : "Unknown",
  };
}

async function loadPokemon(identifier) {
  const normalized = normalizeKey(identifier);
  if (!normalized) throw new HttpError(400, "Provide a pokemon name or id");

  const cached = getFromCache(normalized);
  if (cached) {
    return { data: cached.value, cached: true };
  }

  const pokemon = await fetchJson(
    `${CONFIG.pokeApiBase}/pokemon/${normalized}`,
    "pokemon"
  );
  const species = await fetchJson(pokemon.species.url, "species");
  const view = buildView(pokemon, species);
  setCache(normalized, view);
  return { data: view, cached: false };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", cacheSize: cache.size, ttlMs: CONFIG.cacheTtlMs });
});

app.get("/api/pokemon/:identifier", async (req, res, next) => {
  try {
    const result = await loadPokemon(req.params.identifier);
    res.set("X-Cache", result.cached ? "HIT" : "MISS");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/pokemon", async (req, res, next) => {
  try {
    const { name } = req.query;
    if (!name) throw new HttpError(400, 'Use query param "name"');
    const result = await loadPokemon(name);
    res.set("X-Cache", result.cached ? "HIT" : "MISS");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError)
    return res
      .status(err.statusCode)
      .json({ error: err.message, details: err.details ?? null });
  console.error(err);
  return res.status(500).json({ error: "Unexpected server error" });
});

const distPath = path.join(__dirname, "frontend", "dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(CONFIG.port, () => {
  console.log(`Pokedex API running on http://localhost:${CONFIG.port}`);
});
