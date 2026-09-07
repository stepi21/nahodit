import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import { fetchLiveConditions, findNearestStations, SPA_LEVEL_INFO } from '../lib/hydrology.js'
import { IconClose, IconEdit, IconTrash, IconMapEdit, IconZoom, IconDroplet, IconCheck, IconRevir, IconBoat } from '../lib/icons.jsx'

const fishSVG = (color) => `
  <svg viewBox="0 0 64 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M4,17 C4,8 18,3 32,3 C46,3 58,9 60,17 C58,25 46,31 32,31 C18,31 4,26 4,17 Z" fill="${color}"/>
    <path d="M4,17 L-6,8 L-6,26 Z" fill="${color}"/>
    <circle cx="46" cy="14" r="2.3" fill="#1a1a1a"/>
  </svg>`
const CATEGORY_COLOR = { dravec: '#5C7A85', bila: '#C4A572' }

export default function LocationsModal({ locations, sessions, userId, initialLocationId, onUpdate, onDelete, onClose, onAddArea, onManageAreas, onOpenCatch, onOpenSession, onFocusLocation }) {
  const [selectedId, setSelectedId] = useState(initialLocationId || null)
  const [editing, setEditing] = useState(false)

  const selected = locations.find((l) => l.id === selectedId)
  const sorted = [...locations].sort((a, b) => {
    const aReach = a.scope === 'reach' ? 0 : 1
    const bReach = b.scope === 'reach' ? 0 : 1
    if (aReach !== bReach) return aReach - bReach
    return a.name.localeCompare(b.name)
  })

  if (selected) {
    const canEdit = selected.created_by === userId

    if (editing) {
      return (
        <EditLocationForm
          location={selected}
          onCancel={() => setEditing(false)}
          onSaved={async (fields) => { await onUpdate(selected.id, fields); setEditing(false) }}
        />
      )
    }

    const linkedSessions = sessions.filter((s) => (s.session_locations || []).some((sl) => sl.location_id === selected.id))
    const catches = []
    linkedSessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => { if (c.location_id === selected.id) catches.push({ ...c, sessionRef: s }) })
    })
    const sessionsWithoutCatch = linkedSessions.filter((s) => !(s.catches || []).some((c) => c.location_id === selected.id))

    return (
      <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="ticket" style={{ maxWidth: 440 }}>
          <div className="ticket-top">
            <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
            <div className="eyebrow">Místo</div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {selected.scope === 'reach' && <IconBoat size={18} color="var(--amber)" />}
              {selected.name}
            </h2>
          </div>
          <div className="perforation"></div>
          <div className="ticket-body">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="new-btn" onClick={() => setSelectedId(null)}>← Zpět na místa</button>
              {canEdit && <button className="new-btn" onClick={() => setEditing(true)}><IconEdit size={13} /> Upravit</button>}
              {canEdit && <button className="new-btn" onClick={() => onManageAreas(selected)}><IconMapEdit size={13} /> Upravit oblasti</button>}
              {canEdit && (
                <button
                  className="new-btn danger-btn"
                  onClick={() => { if (window.confirm(`Smazat místo "${selected.name}" z katalogu?`)) { onDelete(selected.id); setSelectedId(null) } }}
                ><IconTrash size={13} /> Smazat</button>
              )}
            </div>
            {selected.revir && <p className="hint-text">Revír: {selected.revir}</p>}
            <LocationPreviewMap location={selected} />
            {onFocusLocation && (selected.area || (selected.lat != null && selected.lng != null)) && (
              <button type="button" className="new-btn" style={{ marginTop: 8 }} onClick={() => onFocusLocation(selected)}>
                <IconZoom size={13} /> Zobrazit na hlavní mapě
              </button>
            )}
            <WaterStatusBlock location={selected} canEdit={canEdit} onUpdate={onUpdate} />

            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 14 }}>
              {catches.length === 0 ? 'Zatím na tomto místě nic nechyceno.' : `${catches.length} chycených ryb na tomto místě`}
            </p>
            {catches.length > 0 && (
              <div className="catch-list" style={{ maxHeight: 'none' }}>
                {catches
                  .sort((a, b) => (b.caught_at || b.sessionRef.session_date || '').localeCompare(a.caught_at || a.sessionRef.session_date || ''))
                  .map((c) => (
                    <div key={c.id} className="catch-row" onClick={() => onOpenCatch(c, selected.id)}>
                      <div className="fish-mini" dangerouslySetInnerHTML={{ __html: fishSVG(CATEGORY_COLOR[c.category]) }} />
                      <div>
                        <div className="c-name">{c.species}</div>
                        <div className="c-sub">{c.length_cm ?? '—'} cm · {c.sessionRef.session_date}</div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {sessionsWithoutCatch.length > 0 && (
              <>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 14 }}>
                  Použito i na těchto výpravách, bez zaznamenaného úlovku:
                </p>
                <div className="catch-list" style={{ maxHeight: 'none' }}>
                  {sessionsWithoutCatch
                    .sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''))
                    .map((s) => (
                      <div key={s.id} className="record-row" onClick={() => onOpenSession(s.id)}>
                        <div className="record-head"><strong>{s.title}</strong><span className="c-sub">{s.session_date}</span></div>
                      </div>
                    ))}
                </div>
              </>
            )}

            {!canEdit && <p className="help-note" style={{ marginTop: 12 }}>Toto místo přidal jiný člen party — upravit nebo smazat ho může jen on.</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ticket" style={{ maxWidth: 400 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
          <div className="eyebrow">Přehled</div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconRevir size={20} color="var(--water-deep)" /> Revíry</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <p className="help-note" style={{ marginBottom: 10 }}>
            Nová místa přidáš přímo tady, nebo tlačítkem "📌 Uložit toto místo do katalogu" u výpravy. Použitelné u jakéhokoli typu výpravy — u přívlače se oblast rovnou vykreslí, u ostatních typů jen doplní název/revír a přiblíží mapu.
          </p>
          <button className="new-btn" onClick={onAddArea} style={{ marginBottom: 14 }}>+ Přidat místo</button>

          {sorted.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Zatím žádné.</p>}
          {sorted.map((l) => (
            <div key={l.id} className="record-row" onClick={() => setSelectedId(l.id)}>
              <div className="record-head">
                <strong style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {l.scope === 'reach'
                    ? <IconBoat size={16} color="var(--amber-deep)" />
                    : <IconRevir size={16} color="var(--water-deep)" dotColor="var(--paper)" />} {l.name}
                </strong>
              </div>
              {l.revir && <div className="c-sub">{l.revir}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WaterStatusBlock({ location, canEdit, onUpdate }) {
  const [live, setLive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [stationName, setStationName] = useState(location.hydro_station_name || null)
  const [stationStream, setStationStream] = useState(location.hydro_stream_name || null)
  const [pendingStationId, setPendingStationId] = useState(null) // nepotvrzený automatický návrh
  const [picking, setPicking] = useState(false)
  const [nearby, setNearby] = useState([])
  const [pickerBusy, setPickerBusy] = useState(false)
  const [pickerError, setPickerError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (location.lat == null || location.lng == null) return
      setLoading(true)
      setLive(null)
      try {
        let stationId = location.hydro_station_id
        if (stationId) {
          if (cancelled) return
          setStationName(location.hydro_station_name)
          setStationStream(location.hydro_stream_name)
          setPendingStationId(null)
        } else {
          const [nearest] = await findNearestStations(location.lat, location.lng, 1)
          if (cancelled) return
          if (nearest) {
            stationId = nearest.objID
            setStationName(nearest.name)
            setStationStream(nearest.stream)
            setPendingStationId(nearest.objID)
          }
        }
        if (stationId) {
          const data = await fetchLiveConditions(stationId)
          if (!cancelled) setLive(data)
        }
      } catch {
        // ČHMÚ se nepovedlo — appka to prostě nezobrazí
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [location.id, location.hydro_station_id])

  async function confirmSuggested() {
    if (!pendingStationId) return
    await onUpdate(location.id, { hydro_station_id: pendingStationId, hydro_station_name: stationName, hydro_stream_name: stationStream })
    setPendingStationId(null)
  }

  async function openPicker() {
    setPicking(true)
    setPickerBusy(true)
    setPickerError(null)
    setNearby([])
    try {
      const list = await findNearestStations(location.lat, location.lng, 6)
      setNearby(list)
      if (list.length === 0) setPickerError('ČHMÚ nevrátilo žádné stanice.')
    } catch (err) {
      console.error('ČHMÚ — nepodařilo se načíst seznam stanic:', err)
      setPickerError('Nepodařilo se spojit s ČHMÚ (viz konzole prohlížeče, F12).')
    }
    setPickerBusy(false)
  }

  async function pickStation(s) {
    setPicking(false)
    await onUpdate(location.id, { hydro_station_id: s.objID, hydro_station_name: s.name, hydro_stream_name: s.stream })
  }

  if (location.lat == null || location.lng == null) return null

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', border: '1px solid var(--paper-line)', borderRadius: 8 }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        <IconDroplet size={13} color="var(--water-mid)" /> Aktuální vodní stav
      </div>
      {loading && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Zjišťuji…</p>}
      {!loading && live && (
        <div className="weather-row">
          <div className="w-item"><div className="num">{live.level_cm ?? '—'} cm</div><div className="lab">vodní stav</div></div>
          <div className="w-item"><div className="num">{live.flow_m3s ?? '—'} m³/s</div><div className="lab">průtok</div></div>
          {live.temp_c != null && <div className="w-item"><div className="num">{live.temp_c}°C</div><div className="lab">teplota vody</div></div>}
        </div>
      )}
      {!loading && live && live.spa_level != null && SPA_LEVEL_INFO[live.spa_level] && (
        <p style={{ fontSize: 12.5, marginTop: 6, marginBottom: 0 }}>
          {SPA_LEVEL_INFO[live.spa_level].icon} {SPA_LEVEL_INFO[live.spa_level].label}
        </p>
      )}
      {!loading && !live && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Pro tohle místo se nepodařilo najít data ČHMÚ.</p>}
      {stationName && (
        <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6, marginBottom: 0 }}>
          stanice {stationName}{stationStream ? ` (${stationStream})` : ''}
        </p>
      )}
      {canEdit && pendingStationId && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="new-btn" onClick={confirmSuggested}><IconCheck size={13} /> Potvrdit tuhle stanici</button>
          <button type="button" className="new-btn" onClick={openPicker}>Vybrat jinou</button>
        </div>
      )}
      {canEdit && !pendingStationId && (
        <button type="button" className="new-btn" onClick={openPicker} style={{ marginTop: 8 }}>Změnit stanici</button>
      )}
      {picking && (
        <div style={{ marginTop: 8 }}>
          {pickerBusy && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Hledám nejbližší stanice…</p>}
          {!pickerBusy && pickerError && <p className="error-text" style={{ fontSize: 12.5 }}>{pickerError}</p>}
          {!pickerBusy && nearby.map((s) => (
            <div key={s.objID} className="bait-picker-item" onClick={() => pickStation(s)}>
              <span>{s.name} ({s.stream}) — {s.distanceKm.toFixed(1)} km</span>
            </div>
          ))}
          <button type="button" className="type-cancel" onClick={() => setPicking(false)}>Zrušit</button>
        </div>
      )}
    </div>
  )
}

function LocationPreviewMap({ location }) {
  const mapEl = useRef(null)
  const mapInst = useRef(null)

  useEffect(() => {
    if (!mapEl.current || !location.area) return
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false })
    mapInst.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    const bounds = []
    location.area
      .filter((pts) => Array.isArray(pts))
      .map((pts) => pts.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number'))
      .filter((pts) => pts.length >= 3)
      .forEach((pts) => {
        L.polygon(pts.map((p) => [p.lat, p.lng]), { color: '#6B7A4F', weight: 2, fillColor: '#6B7A4F', fillOpacity: 0.18 }).addTo(map)
        pts.forEach((p) => bounds.push([p.lat, p.lng]))
      })
    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] })
    setTimeout(() => map.invalidateSize(), 50)
    return () => { map.remove(); mapInst.current = null }
  }, [location.id])

  if (!location.area) return null
  return <div ref={mapEl} style={{ width: '100%', height: 200, borderRadius: 10, marginTop: 8, border: '1px solid var(--paper-line)' }} />
}

function EditLocationForm({ location, onCancel, onSaved }) {
  const [name, setName] = useState(location.name)
  const [revir, setRevir] = useState(location.revir || '')
  const [scope, setScope] = useState(location.scope || 'spot')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await onSaved({ name, revir: revir || null, scope })
    setBusy(false)
  }

  return (
    <div className="side-panel">
      <div className="ticket" style={{ maxWidth: 380 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onCancel}><IconClose size={16} /></button>
          <div className="eyebrow">Úprava</div>
          <h2>{location.name}</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <form onSubmit={handleSubmit}>
            <label className="field-label">Název</label>
            <input className="text-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <label className="field-label">Revír</label>
            <input className="text-input" value={revir} onChange={(e) => setRevir(e.target.value)} />
            <label className="field-label">Typ místa</label>
            <div className="tab-row">
              <button
                type="button"
                className={`tab-btn ${scope === 'spot' ? 'active' : ''}`}
                onClick={() => setScope('spot')}
              ><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconRevir size={13} dotColor={scope === 'spot' ? '#fff' : 'var(--water-deep)'} /> Malé místo</span></button>
              <button
                type="button"
                className={`tab-btn ${scope === 'reach' ? 'active' : ''}`}
                onClick={() => setScope('reach')}
              ><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconBoat size={13} /> Velký úsek (loď)</span></button>
            </div>
            {scope === 'reach' && (
              <p className="help-note" style={{ marginBottom: 8 }}>
                Velký úsek se nezobrazuje na přehledové mapě mezi malými místy — jen v seznamu (nahoře) a po kliknutí „Zobrazit na hlavní mapě".
              </p>
            )}
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Ukládám…' : 'Uložit'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
