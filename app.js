const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_MS = 10 * 60 * 1000;

const $ = (sel) => document.querySelector(sel);
const state = { days: [], unit: "C", sort: "date", filter: "all" };

async function getJSON(url) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(url) || "null");
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.d;
  } catch { }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`The weather service returned an error (${res.status}). Try again shortly.`);
    const data = await res.json();
    try { sessionStorage.setItem(url, JSON.stringify({ t: Date.now(), d: data })); } catch { }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("The request timed out. Check your connection and try again.");
    if (err instanceof TypeError) throw new Error("Could not reach the weather service. Check your connection.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function describe(code) {
  if (code === 0) return ["☀️", "Clear sky"];
  if (code <= 2) return ["🌤️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Overcast"];
  if (code <= 48) return ["🌫️", "Fog"];
  if (code <= 57) return ["🌦️", "Drizzle"];
  if (code <= 67) return ["🌧️", "Rain"];
  if (code <= 77) return ["❄️", "Snow"];
  if (code <= 82) return ["🌧️", "Rain showers"];
  if (code <= 86) return ["🌨️", "Snow showers"];
  return ["⛈️", "Thunderstorm"];
}

const temp = (c) => state.unit === "C" ? `${Math.round(c)}°C` : `${Math.round(c * 9 / 5 + 32)}°F`;
const setStatus = (msg, isError = false) => {
  const el = $("#status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
};

async function searchCity(name) {
  setStatus("Searching…");
  $("#matches").replaceChildren();
  $("#results").hidden = true;
  try {
    const data = await getJSON(`${GEO_URL}?name=${encodeURIComponent(name)}&count=5&language=en`);
    if (!data.results || !data.results.length) {
      setStatus(`No city found for "${name}". Check the spelling or try a nearby larger city.`, true);
      return;
    }
    if (data.results.length === 1) return loadForecast(data.results[0]);
    setStatus("Several matches found. Pick one:");
    data.results.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = [p.name, p.admin1, p.country].filter(Boolean).join(", ");
      b.addEventListener("click", () => loadForecast(p));
      $("#matches").appendChild(b);
    });
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function loadForecast(place) {
  $("#matches").replaceChildren();
  setStatus("Loading forecast…");
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: 14,
  });
  try {
    const data = await getJSON(`${FORECAST_URL}?${params}`);
    if (!data.daily || !data.current) throw new Error("The weather service sent an unexpected response.");
    const d = data.daily;
    state.days = d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      rain: d.precipitation_probability_max[i] ?? 0,
      wind: d.wind_speed_10m_max[i],
    }));
    state.current = data.current;
    $("#place").textContent = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
    localStorage.setItem("lastCity", place.name);
    setStatus("");
    $("#results").hidden = false;
    render();
  } catch (err) {
    setStatus(err.message, true);
  }
}

function render() {
  const [, label] = describe(state.current.weather_code);
  $("#condition").textContent = `${label} now · wind ${Math.round(state.current.wind_speed_10m)} km/h`;
  $("#now-temp").textContent = temp(state.current.temperature_2m);
  $("#unit").textContent = state.unit === "C" ? "Switch to °F" : "Switch to °C";

  let list = state.days.filter((d) => {
    if (state.filter === "rain") return d.rain >= 50;
    if (state.filter === "dry") return d.rain < 30;
    if (state.filter === "warm") return d.max >= 25;
    return true;
  });
  const sorters = {
    date: (a, b) => a.date.localeCompare(b.date),
    hot: (a, b) => b.max - a.max,
    cold: (a, b) => a.min - b.min,
    wet: (a, b) => b.rain - a.rain,
  };
  list.sort(sorters[state.sort]);

  const grid = $("#grid");
  grid.replaceChildren();
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No days match this filter. Choose “All days” to see the full forecast.";
    grid.appendChild(p);
    return;
  }
  list.forEach((d) => grid.appendChild(dayCard(d)));
}

function dayCard(d) {
  const [icon, label] = describe(d.code);
  const when = new Date(`${d.date}T00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const el = document.createElement("article");
  el.className = "day";
  const rows = [
    ["date", when],
    ["icon", icon],
    ["cond", label],
    ["temps", `${temp(d.max)} `],
    ["rain", `Rain chance ${d.rain}%`],
    ["wind", `Wind ${Math.round(d.wind)} km/h`],
  ];
  rows.forEach(([cls, text]) => {
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    if (cls === "temps") {
      const low = document.createElement("span");
      low.textContent = `/ ${temp(d.min)}`;
      div.appendChild(low);
    }
    el.appendChild(div);
  });
  return el;
}

$("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#city").value.trim();
  if (name) searchCity(name);
});
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
$("#filter").addEventListener("change", (e) => { state.filter = e.target.value; render(); });
$("#unit").addEventListener("click", () => { state.unit = state.unit === "C" ? "F" : "C"; render(); });

fetch(location.href, { method: "HEAD", cache: "no-store" })
  .then((r) => { $("#server").textContent = r.headers.get("X-Served-By") || "local machine"; })
  .catch(() => { $("#server").textContent = "local machine"; });

const last = localStorage.getItem("lastCity");
if (last) { $("#city").value = last; searchCity(last); }
