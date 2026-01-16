import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function App() {
  const [query, setQuery] = useState("pikachu");
  const [pokemon, setPokemon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const fetchPokemon = async (value) => {
    const term = value.trim().toLowerCase();
    if (!term) {
      setError("Type a pokemon name or id");
      setPokemon(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/pokemon/${encodeURIComponent(term)}`,
        {
          signal: controller.signal,
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Could not load pokemon");
      setPokemon(body.data ?? body);
    } catch (err) {
      if (controller.signal.aborted) return;
      setPokemon(null);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPokemon(query);
    return () => abortRef.current?.abort();
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    fetchPokemon(query);
  };

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Pokedex</p>
          <h1>Search any Pokemon</h1>
          <p className="muted">
            Powered by PokeAPI with a local cache for fast repeat lookups.
          </p>
        </div>
      </header>

      <form className="search" onSubmit={onSubmit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="pikachu, bulbasaur, 150..."
          aria-label="Search Pokemon"
        />
        <button type="submit">Search</button>
      </form>

      {error && <div className="alert">{error}</div>}
      {loading && <div className="loading">Loading...</div>}

      {pokemon && !loading && (
        <section className="card">
          <div className="card-head">
            <div>
              <p className="eyebrow">{pokemon.displayId ?? ""}</p>
              <h2>{pokemon.name}</h2>
              <div className="types">
                {pokemon.types?.map((t) => (
                  <span key={t} className="pill">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {pokemon.sprites?.artwork && (
              <img
                src={pokemon.sprites.artwork}
                alt={`${pokemon.name} artwork`}
                className="artwork"
              />
            )}
          </div>

          <p className="muted flavor">{pokemon.flavorText}</p>

          <div className="facts">
            <Fact label="Height" value={`${pokemon.height} m`} />
            <Fact label="Weight" value={`${pokemon.weight} kg`} />
            <Fact label="Base XP" value={pokemon.baseExperience} />
            <Fact label="Habitat" value={pokemon.habitat} />
            <Fact label="Color" value={pokemon.color} />
          </div>

          <div className="stats">
            {pokemon.stats?.map((stat) => (
              <div key={stat.key} className="stat">
                <div className="stat-top">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
                <div className="bar">
                  <div style={{ width: `${Math.min(stat.value, 200) / 2}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="abilities">
            <p className="eyebrow">Abilities</p>
            <div className="pill-row">
              {pokemon.abilities?.map((ab) => (
                <span key={ab.name} className="pill ghost">
                  {ab.name}
                  {ab.isHidden ? " (Hidden)" : ""}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
