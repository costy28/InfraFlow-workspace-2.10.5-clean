const WMO_CODES = {
  0: { label: 'Senin', icon: '☀️', risk: 'scazut' },
  1: { label: 'Predominant senin', icon: '🌤️', risk: 'scazut' },
  2: { label: 'Parțial noros', icon: '⛅', risk: 'scazut' },
  3: { label: 'Acoperit', icon: '☁️', risk: 'scazut' },
  45: { label: 'Ceață', icon: '🌫️', risk: 'mediu' },
  48: { label: 'Ceață cu chiciură', icon: '🌫️', risk: 'ridicat' },
  51: { label: 'Burniță ușoară', icon: '🌦️', risk: 'mediu' },
  53: { label: 'Burniță moderată', icon: '🌦️', risk: 'mediu' },
  55: { label: 'Burniță densă', icon: '🌧️', risk: 'ridicat' },
  61: { label: 'Ploaie ușoară', icon: '🌧️', risk: 'mediu' },
  63: { label: 'Ploaie moderată', icon: '🌧️', risk: 'mediu' },
  65: { label: 'Ploaie torențială', icon: '🌧️', risk: 'ridicat' },
  71: { label: 'Ninsoare ușoară', icon: '🌨️', risk: 'ridicat' },
  73: { label: 'Ninsoare moderată', icon: '❄️', risk: 'critic' },
  75: { label: 'Ninsoare abundentă', icon: '❄️', risk: 'critic' },
  77: { label: 'Grăunțe de zăpadă', icon: '🌨️', risk: 'ridicat' },
  80: { label: 'Averse ușoare', icon: '🌦️', risk: 'mediu' },
  85: { label: 'Averse de ninsoare', icon: '🌨️', risk: 'critic' },
  86: { label: 'Viscol', icon: '🌪️', risk: 'critic' },
  95: { label: 'Furtună', icon: '⛈️', risk: 'critic' }
}

let meteoCache = { data: null, timestamp: 0 }
const CACHE_TTL = 30 * 60 * 1000

function recomandaInterventie(meteo) {
  const { temperature_2m, weathercode, windspeed_10m } = meteo
  const wmo = WMO_CODES[weathercode] || { risk: 'scazut' }

  // Ninsoare sau viscol -> interventie activa
  if ([71, 73, 75, 77, 85, 86].includes(weathercode)) {
    return {
      tip: 'activ',
      motiv: `Ninsoare activă, temperatura ${temperature_2m}°C`,
      culoare: 'rosu'
    }
  }

  // Temperaturi negative + precipitatii sau ceata -> preventiv
  if (temperature_2m <= 0 &&
      [45, 48, 51, 53, 55, 61, 63, 65].includes(weathercode)) {
    return {
      tip: 'preventiv',
      motiv: `Temp. ${temperature_2m}°C cu ${wmo.label} — risc gheațã`,
      culoare: 'galben'
    }
  }

  // Temperaturi negative + uscat -> monitorizare
  if (temperature_2m <= -2 && wmo.risk === 'scazut') {
    return {
      tip: 'monitorizare',
      motiv: `Temp. ${temperature_2m}°C, uscat — posibil gheațã`,
      culoare: 'galben'
    }
  }

  // Pozitiv + uscat -> fara interventie
  return {
    tip: 'fara_interventie',
    motiv: `Temperatura ${temperature_2m}°C, condiții normale`,
    culoare: 'verde'
  }
}

function envNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

async function getMeteo() {
  if (Date.now() - meteoCache.timestamp < CACHE_TTL) {
    return meteoCache.data
  }

  const latitude = envNumber('WEATHER_LAT', 46.9259)
  const longitude = envNumber('WEATHER_LNG', 26.3709)
  const url = 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitude}&longitude=${longitude}` +
    '&current=temperature_2m,apparent_temperature,' +
    'precipitation,snowfall,windspeed_10m,' +
    'weathercode,relativehumidity_2m,is_day' +
    '&timezone=Europe%2FBucharest'

  try {
    const res = await fetch(url)
    if (!res.ok) return null

    const json = await res.json()
    const c = json.current
    if (!c) return null

    meteoCache = {
      timestamp: Date.now(),
      data: {
        temperatura: c.temperature_2m,
        temperatura_resimtita: c.apparent_temperature,
        precipitatii: c.precipitation,
        ninsoare: c.snowfall,
        vant_kmh: c.windspeed_10m,
        umiditate: c.relativehumidity_2m,
        cod_wmo: c.weathercode,
        stare: WMO_CODES[c.weathercode] || { label: 'Necunoscut', icon: '?', risk: 'necunoscut' },
        recomandare: recomandaInterventie(c),
        actualizat_la: new Date().toISOString()
      }
    }

    return meteoCache.data
  } catch (error) {
    return null
  }
}

module.exports = { getMeteo, recomandaInterventie, WMO_CODES }
