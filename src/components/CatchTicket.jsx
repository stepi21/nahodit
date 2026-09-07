import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { uploadPhoto } from '../lib/storage.js'
import { moonPhaseName, fetchWeather } from '../lib/weather.js'
import { fetchWaterConditions, findNearestStations, WATER_PRECISION_LABEL, SPA_LEVEL_INFO } from '../lib/hydrology.js'
import { estimateWeightKg, hasWeightEstimate } from '../lib/weightEstimate.js'
import { actualDateForTime } from '../lib/sessionTime.js'
import { useLockBodyScroll } from '../lib/useLockBodyScroll.js'
import BaitPicker from './BaitPicker.jsx'
import { IconClose, IconArrowLeft, IconEdit, IconTrash, IconCamera, IconRevir, IconCalendar, IconThermometer, IconGauge, IconWind, IconMoonPhase, IconDroplet, IconRefresh, IconPressureTrend, IconApprox } from '../lib/icons.jsx'

const CATEGORY_COLOR = { dravec: '#5C7A85', bila: '#C4A572' }

const fishSVG = (color) => `
  <svg viewBox="0 0 64 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M4,17 C4,8 18,3 32,3 C46,3 58,9 60,17 C58,25 46,31 32,31 C18,31 4,26 4,17 Z" fill="${color}"/>
    <path d="M4,17 L-6,8 L-6,26 Z" fill="${color}"/>
    <circle cx="46" cy="14" r="2.3" fill="#1a1a1a"/>
  </svg>`

function normalizeSearchText(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Najde stanici ČHMÚ podle STEJNÉHO čísla revíru už dřív ručně potvrzeného
// u jiného místa v katalogu -- appka appku hledá bez ohledu na GPS
// vzdálenost. Řeší soutoky/souběžné toky, kde appka podle vzdušné
// vzdálenosti bez tohohle skočí na nejbližší stanici, i když je fyzicky
// na jiné řece než revír, na kterém se skutečně chytalo.
function findStationsByRevir(revir, locationsCatalog) {
  const key = normalizeSearchText(revir)
  if (!key) return []
  const seen = new Map()
  locationsCatalog.forEach((l) => {
    if (l.hydro_station_id && normalizeSearchText(l.revir) === key && !seen.has(l.hydro_station_id)) {
      seen.set(l.hydro_station_id, { objID: l.hydro_station_id, name: l.hydro_station_name, stream: l.hydro_stream_name })
    }
  })
  return Array.from(seen.values())
}

function toLocalTimeInput(isoString) {
  const d = new Date(isoString)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function CatchTicket({ catchData: c, session, catcherName, canEdit = false, baitPhotoMap = {}, baitListId = 'known-baits-all', baitCatalog = [], baitCategory = null, locationsCatalog = [], onAddBait, onBackfillBaitPhoto, onSetCatchLocation, onRelocate, onFocusLocation, onOpenSession, onClose, onUpdated, onDeleted, onShowToast }) {
  useLockBodyScroll()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pickingRevir, setPickingRevir] = useState(false)
  // appka tady appce postaví seznam appce dostupných appce fotek (úlovek +
  // appce nástraha, pokud appka obojí má) -- appka appce klikne na kteroukoli
  // z nich a appka appce otevře přes celou obrazovku, s možností přepnout na
  // tu druhou (šipky nebo swipe).
  const photos = [
    c.photo_url && { url: c.photo_url, label: c.species },
    c.bait_photo_url && { url: c.bait_photo_url, label: c.bait || 'Nástraha' },
  ].filter(Boolean)
  const [fullscreenIndex, setFullscreenIndex] = useState(null)
  const touchStartXRef = useRef(null)
  const linkedLocations = (session?.session_locations || [])
    .map((sl) => locationsCatalog.find((l) => l.id === sl.location_id))
    .filter(Boolean)

  function handlePickRevir(loc) {
    setPickingRevir(false)
    onSetCatchLocation?.(c.id, loc.id, loc.revir || null)
  }
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherError, setWeatherError] = useState(null)
  const [form, setForm] = useState({
    species: c.species, category: c.category, revir: c.revir || '',
    length_cm: c.length_cm ?? '', weight_kg: c.weight_kg ?? '', weight_estimated: c.weight_estimated ?? false, bait: c.bait ?? '',
    time: c.caught_at ? toLocalTimeInput(c.caught_at) : '',
    photoFile: null, baitPhotoFile: null, bait_photo_url: c.bait_photo_url || null,
    weather_temp_c: c.weather_temp_c ?? null, weather_pressure_hpa: c.weather_pressure_hpa ?? null,
    weather_pressure_trend: c.weather_pressure_trend ?? null,
    weather_wind: c.weather_wind || null, weather_desc: c.weather_desc || null,
    water_level_cm: c.water_level_cm ?? null, water_flow_m3s: c.water_flow_m3s ?? null, water_temp_c: c.water_temp_c ?? null,
    water_station_name: c.water_station_name || null, water_data_precision: c.water_data_precision || null,
    water_spa_level: c.water_spa_level ?? null,
  })
  const color = CATEGORY_COLOR[c.category]

  async function handleFetchWeather() {
    if (!form.time) { setWeatherError('Nejdřív vyplň čas úlovku.'); return }
    setWeatherBusy(true); setWeatherError(null)
    // Stejné ošetření přechodu přes půlnoc jako appka appce použije u
    // ukládání (viz handleSave níže) -- appka appce dohledá počasí/vodu
    // pro skutečný kalendářní den úlovku, ne pro den, kdy výprava jen
    // začala.
    const sessionDateFallback = session?.session_date || c.caught_at?.slice(0, 10)
    const catchDate = actualDateForTime(sessionDateFallback, session?.time_from, form.time)
    try {
      const w = await fetchWeather(c.lat, c.lng, catchDate, form.time)
      setForm((f) => ({ ...f, weather_temp_c: w.temp, weather_pressure_hpa: w.pressure, weather_pressure_trend: w.pressureTrend, weather_wind: w.wind, weather_desc: w.desc }))
    } catch (e) {
      setWeatherError(e.message)
    }
    try {
      let confirmed = null
      if (c.location_id) {
        const own = locationsCatalog.find((l) => l.id === c.location_id)
        if (own?.hydro_station_id) confirmed = own
      }
      if (!confirmed && linkedLocations.length === 1 && linkedLocations[0].hydro_station_id) {
        confirmed = linkedLocations[0]
      }
      const byRevir = !confirmed ? findStationsByRevir(form.revir || c.revir, locationsCatalog) : []
      const station = confirmed
        ? { objID: confirmed.hydro_station_id, name: confirmed.hydro_station_name }
        : byRevir[0] || (await findNearestStations(c.lat, c.lng, 1))[0]
      if (station) {
        const water = await fetchWaterConditions(station.objID, catchDate, form.time)
        if (water) {
          setForm((f) => ({
            ...f,
            water_level_cm: water.level_cm, water_flow_m3s: water.flow_m3s, water_temp_c: water.temp_c,
            water_station_name: station.name, water_data_precision: water.precision, water_spa_level: water.spa_level,
          }))
        }
      }
    } catch (err) {
      console.warn('ČHMÚ se nepovedlo (appka to nechá prázdné):', err)
    }
    setWeatherBusy(false)
  }

  function handleBaitChange(value) {
    setForm((f) => {
      const next = { ...f, bait: value }
      if (!f.baitPhotoFile) {
        const match = baitPhotoMap[value.trim().toLowerCase()]
        if (match) next.bait_photo_url = match
      }
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!navigator.onLine) {
      alert('Nejsi připojený k internetu. Zkus to znovu, až se signál vrátí — rozepsané úpravy zůstávají vyplněné, nic se neztratilo.')
      return
    }
    setBusy(true)
    try {
      let photo_url = c.photo_url
      let photo_thumb_url = c.photo_thumb_url
      if (form.photoFile) {
        const uploaded = await uploadPhoto(form.photoFile, `catches/${c.session_id}`)
        if (uploaded) { photo_url = uploaded.url; photo_thumb_url = uploaded.thumbUrl }
      }
      let bait_photo_url = form.bait_photo_url || null
      let bait_photo_thumb_url = form.bait_photo_thumb_url || null
      if (form.baitPhotoFile) {
        const uploaded = await uploadPhoto(form.baitPhotoFile, `catches/${c.session_id}`)
        if (uploaded) {
          bait_photo_url = uploaded.url
          bait_photo_thumb_url = uploaded.thumbUrl
          onBackfillBaitPhoto?.(form.bait, bait_photo_url, bait_photo_thumb_url)
        }
      }
      const sessionDate = session?.session_date || (c.caught_at ? c.caught_at.slice(0, 10) : null)
      const catchDate = form.time && sessionDate ? actualDateForTime(sessionDate, session?.time_from, form.time) : sessionDate
      const caught_at = form.time && catchDate
        ? new Date(`${catchDate}T${form.time}:00`).toISOString()
        : c.caught_at
      const { error } = await supabase.from('catches').update({
        species: form.species, category: form.category, revir: form.revir || null,
        length_cm: form.length_cm || null, weight_kg: form.weight_kg || null, weight_estimated: form.weight_kg ? form.weight_estimated : false,
        bait: form.bait, photo_url, photo_thumb_url, bait_photo_url, bait_photo_thumb_url, caught_at,
        weather_temp_c: form.weather_temp_c, weather_pressure_hpa: form.weather_pressure_hpa, weather_pressure_trend: form.weather_pressure_trend,
        weather_wind: form.weather_wind, weather_desc: form.weather_desc,
        water_level_cm: form.water_level_cm, water_flow_m3s: form.water_flow_m3s, water_temp_c: form.water_temp_c,
        water_station_name: form.water_station_name, water_data_precision: form.water_data_precision, water_spa_level: form.water_spa_level,
      }).eq('id', c.id)
      if (error) { alert(error.message); return }
      setEditing(false)
      onShowToast?.('✓ Úlovek uložen')
      onUpdated()
    } catch (err) {
      alert('Uložení se nepovedlo (možná vypadlo připojení). Formulář zůstává vyplněný, zkus to prosím znovu.\n\n' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Opravdu smazat tento úlovek? Nedá se to vrátit zpět.')) return
    setBusy(true)
    const { error } = await supabase.from('catches').delete().eq('id', c.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    onDeleted()
  }

  return (
    <div className="modal-bg show catch-ticket-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {pickingRevir && createPortal(
        <div className="modal-bg show bait-picker-modal" onClick={(e) => e.target === e.currentTarget && setPickingRevir(false)}>
          <div className="ticket" style={{ maxWidth: 320 }}>
            <div className="ticket-top">
              <button type="button" className="ticket-close" onClick={() => setPickingRevir(false)}><IconClose size={16} /></button>
              <div className="eyebrow">Revír</div>
              <h2>Na kterém revíru?</h2>
            </div>
            <div className="perforation"></div>
            <div className="ticket-body">
              {linkedLocations.map((l) => (
                <div key={l.id} className="bait-picker-item" onClick={() => handlePickRevir(l)}>
                  <span>{l.name}{l.revir ? ` (${l.revir})` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className="ticket">
        <div className="ticket-mobile-backbar">
          <button type="button" onClick={onClose}><IconArrowLeft size={16} /> Zpět</button>
        </div>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
          <div className="eyebrow">Úlovkový lístek</div>
          <h2>{c.species}</h2>
          {catcherName && <div className="catcher-sub">Chytil: {catcherName}</div>}
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          {!editing ? (
            <>
              <div className="ticket-illustration">
                {c.photo_url
                  ? <img src={c.photo_url} alt={c.species} className="catch-photo" onClick={() => setFullscreenIndex(photos.findIndex((p) => p.url === c.photo_url))} style={{ cursor: 'zoom-in' }} />
                  : <div style={{ width: 120 }} dangerouslySetInnerHTML={{ __html: fishSVG(color) }} />}
              </div>
              <div className="ticket-stats">
                <div className="stat"><div className="num">{c.length_cm ?? '—'} cm</div><div className="lab">délka</div></div>
                <div className="stat">
                  <div className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    {c.weight_kg ?? '—'} kg {c.weight_kg != null && c.weight_estimated && <IconApprox size={13} />}
                  </div>
                  <div className="lab">váha</div>
                </div>
              </div>
              {c.revir && <div className="ticket-line"><span className="lab">Revír</span><span className="val">{c.revir}</span></div>}
              <div className="ticket-line"><span className="lab">Nástraha</span><span className="val">{c.bait || '—'}</span></div>
              {c.bait_photo_url && (
                <div className="ticket-illustration" style={{ marginTop: 6 }}>
                  <img src={c.bait_photo_url} alt="nástraha" style={{ maxHeight: 90, borderRadius: 8, cursor: 'zoom-in' }} onClick={() => setFullscreenIndex(photos.findIndex((p) => p.url === c.bait_photo_url))} />
                </div>
              )}
              <div className="ticket-line"><span className="lab">Čas úlovku</span><span className="val">{c.caught_at ? new Date(c.caught_at).toLocaleTimeString('cs-CZ') : '—'}</span></div>
              <div className="ticket-line">
                <span className="lab">Lokace</span>
                <span className="val link-val" onClick={onFocusLocation} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconRevir size={13} color="var(--water-mid)" /> {c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}</span>
              </div>
              {session && (
                <div className="ticket-line">
                  <span className="lab">Výprava</span>
                  <span className="val link-val" style={{ fontFamily: 'inherit', fontWeight: 600 }} onClick={onOpenSession}>{session.title} →</span>
                </div>
              )}
              {(c.weather_temp_c != null || session) && (
                <div className="conditions-strip">
                  <span className="cond-chip"><IconCalendar size={12} /> {session?.session_date || c.caught_at?.slice(0, 10)}</span>
                  <span className="cond-chip"><IconThermometer size={12} /> {c.weather_temp_c ?? session?.weather_temp_c ?? '—'}°C</span>
                  <span className="cond-chip">
                    <IconGauge size={12} /> {c.weather_pressure_hpa ?? session?.weather_pressure_hpa ?? '—'} hPa
                    <IconPressureTrend trend={c.weather_pressure_trend ?? session?.weather_pressure_trend} size={12} />
                  </span>
                  <span className="cond-chip"><IconWind size={12} /> {c.weather_wind || session?.weather_wind || '—'}</span>
                  <span className="cond-chip">{(() => { const phase = moonPhaseName(session?.session_date || c.caught_at?.slice(0, 10)); return <><IconMoonPhase phase={phase} size={13} /> {phase}</> })()}</span>
                  {(c.water_station_name || session?.water_station_name) && (
                    <span className="cond-chip">
                      <IconDroplet size={12} color="var(--water-mid)" /> {c.water_level_cm ?? session?.water_level_cm ?? '—'} cm · {c.water_flow_m3s ?? session?.water_flow_m3s ?? '—'} m³/s
                      {(c.water_temp_c ?? session?.water_temp_c) != null ? ` · ${c.water_temp_c ?? session?.water_temp_c} °C` : ''}
                      {(() => {
                        const lvl = c.water_spa_level ?? session?.water_spa_level
                        return lvl != null && SPA_LEVEL_INFO[lvl] ? ` · ${SPA_LEVEL_INFO[lvl].icon}` : ''
                      })()}
                    </span>
                  )}
                </div>
              )}
              <p className="help-note" style={{ marginTop: 4 }}>
                {c.weather_temp_c != null ? 'Počasí přesně pro čas úlovku.' : 'Počasí z výpravy — nemusí přesně odpovídat času tohoto úlovku.'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {canEdit && <button className="new-btn" onClick={() => setEditing(true)}><IconEdit size={13} /> Upravit</button>}
                {canEdit && linkedLocations.length >= 2 && <button className="new-btn" onClick={() => setPickingRevir(true)}><IconRevir size={13} /> Revír</button>}
                {canEdit && <button className="new-btn danger-btn" onClick={handleDelete} disabled={busy}><IconTrash size={13} /> Smazat</button>}
              </div>
            </>
          ) : (
            <form onSubmit={handleSave}>
              <label className="field-label">Druh ryby</label>
              <input className="text-input" required value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} />
              <label className="field-label">Revír / lokalita</label>
              <input className="text-input" value={form.revir} onChange={(e) => setForm({ ...form, revir: e.target.value })} placeholder="např. Labe 19" />
              <label className="field-label">Kategorie</label>
              <select className="text-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="dravec">Dravec</option>
                <option value="bila">Bílá ryba</option>
              </select>
              <div className="input-row">
                <div className="input-row-auto field-compact">
                  <label className="field-label">Délka (cm)</label>
                  <input className="text-input" type="number" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} />
                </div>
                <div className="input-row-auto field-compact">
                  <label className="field-label">Váha (kg)</label>
                  <input className="text-input" type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value, weight_estimated: false })} />
                </div>
                <div>
                  <label className="field-label">Čas</label>
                  <input className="text-input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
              </div>
              {!form.weight_kg && form.length_cm && hasWeightEstimate(form.species) && estimateWeightKg(form.species, form.length_cm) != null && (
                <p className="hint-text" style={{ marginTop: -6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <IconApprox size={14} /> Odhad z délky: {estimateWeightKg(form.species, form.length_cm)} kg
                  <button type="button" className="new-btn" style={{ marginLeft: 4 }} onClick={() => setForm({ ...form, weight_kg: estimateWeightKg(form.species, form.length_cm), weight_estimated: true })}>
                    Použít
                  </button>
                </p>
              )}
              <label className="field-label">Nástraha</label>
              <BaitPicker
                value={form.bait}
                category={baitCategory}
                catalog={baitCatalog}
                onChange={handleBaitChange}
                onAddBait={onAddBait}
              />
              <label className="photo-label" style={{ display: 'inline-block', marginTop: 4 }}>
                <IconCamera size={13} />{' '}{form.baitPhotoFile ? form.baitPhotoFile.name : (form.bait_photo_url ? 'nalezeno / uloženo' : 'foto nástrahy')}
                <input type="file" accept="image/*" hidden onChange={(e) => setForm({ ...form, baitPhotoFile: e.target.files[0] })} />
              </label>
              {form.bait_photo_url && !form.baitPhotoFile && <img src={form.bait_photo_url} alt="" className="bait-thumb" />}
              <br />
              <label className="field-label">Foto úlovku</label>
              <label className="photo-label" style={{ display: 'inline-block', marginTop: 4 }}>
                <IconCamera size={13} />{' '}{form.photoFile ? form.photoFile.name : (c.photo_url ? 'změnit foto' : 'vybrat foto')}
                <input type="file" accept="image/*" hidden onChange={(e) => setForm({ ...form, photoFile: e.target.files[0] })} />
              </label>
              <button type="button" className="new-btn" onClick={handleFetchWeather} disabled={weatherBusy} style={{ marginTop: 8 }}>
                {weatherBusy ? 'Zjišťuji…' : <><IconRefresh size={13} /> Dopočítat podmínky pro tento čas</>}
              </button>
              {weatherError && <p className="error-text">{weatherError}</p>}
              {form.weather_temp_c != null && (
                <p className="hint-text">{form.weather_temp_c}°C · {form.weather_pressure_hpa} hPa · {form.weather_wind} · {form.weather_desc}</p>
              )}
              {form.water_station_name && (
                <p className="hint-text" style={{ marginTop: 4 }}>
                  <IconDroplet size={13} color="var(--water-mid)" /> {form.water_level_cm ?? '—'} cm · {form.water_flow_m3s ?? '—'} m³/s{form.water_temp_c != null ? ` · ${form.water_temp_c} °C` : ''}
                  {' '}({form.water_station_name}{form.water_data_precision ? `, ${WATER_PRECISION_LABEL[form.water_data_precision]}` : ''})
                </p>
              )}
              <button type="button" className="new-btn" onClick={onRelocate} style={{ marginTop: 4 }}><IconRevir size={13} /> Změnit pozici úlovku na mapě</button>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="new-btn" type="button" onClick={() => setEditing(false)}>Zrušit</button>
                <button className="btn-primary" style={{ margin: 0 }} type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit změny'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
      {fullscreenIndex !== null && photos[fullscreenIndex] && (
        <div
          className="fullscreen-photo-overlay"
          onClick={(e) => e.target === e.currentTarget && setFullscreenIndex(null)}
          onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX }}
          onTouchEnd={(e) => {
            if (touchStartXRef.current == null) return
            const dx = e.changedTouches[0].clientX - touchStartXRef.current
            touchStartXRef.current = null
            if (Math.abs(dx) < 40 || photos.length < 2) return
            setFullscreenIndex((i) => (dx < 0 ? (i + 1) % photos.length : (i - 1 + photos.length) % photos.length))
          }}
        >
          <button className="fullscreen-photo-close" onClick={() => setFullscreenIndex(null)}><IconClose size={20} color="#fff" /></button>
          <img src={photos[fullscreenIndex].url} alt={photos[fullscreenIndex].label} className="fullscreen-photo-img" />
          {photos.length > 1 && (
            <>
              <button className="fullscreen-photo-nav prev" onClick={() => setFullscreenIndex((i) => (i - 1 + photos.length) % photos.length)}>‹</button>
              <button className="fullscreen-photo-nav next" onClick={() => setFullscreenIndex((i) => (i + 1) % photos.length)}>›</button>
              <div className="fullscreen-photo-dots">
                {photos.map((_, i) => <span key={i} className={i === fullscreenIndex ? 'active' : ''} />)}
              </div>
            </>
          )}
          <div className="fullscreen-photo-label">{photos[fullscreenIndex].label}</div>
        </div>
      )}
    </div>
  )
}
