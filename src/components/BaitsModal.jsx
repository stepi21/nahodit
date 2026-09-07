import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { uploadPhoto } from '../lib/storage.js'
import { IconClose } from '../lib/icons.jsx'
import { IconEdit, IconTrash, IconCamera } from '../lib/icons.jsx'

const fishSVG = (color) => `
  <svg viewBox="0 0 64 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M4,17 C4,8 18,3 32,3 C46,3 58,9 60,17 C58,25 46,31 32,31 C18,31 4,26 4,17 Z" fill="${color}"/>
    <path d="M4,17 L-6,8 L-6,26 Z" fill="${color}"/>
    <circle cx="46" cy="14" r="2.3" fill="#1a1a1a"/>
  </svg>`
const CATEGORY_COLOR = { dravec: '#5C7A85', bila: '#C4A572' }
const TYPE_CATEGORY = { kapr: 'bila', privlac: 'dravec', muska: 'dravec', plavana: 'bila', jine: null }

// Sloučí nástrahy zadané u prutů (i bez úlovku), z úlovků, a z katalogu do
// jednoho seznamu -- katalog vyhrává, pokud existuje. Sdílené mezi detailem
// (BaitsModal) a přehledovým seznamem v postranním panelu (Dashboard.jsx).
export function computeBaitsList(sessions, baitCatalog) {
  const catchMap = {}
  sessions.forEach((s) => {
    ;(s.catches || []).forEach((c) => {
      if (!c.bait) return
      const key = c.bait.trim().toLowerCase()
      if (!key) return
      if (!catchMap[key]) catchMap[key] = { catches: [], dravec: 0, bila: 0, photo_url: null }
      catchMap[key].catches.push({ ...c, sessionRef: s })
      catchMap[key][c.category] = (catchMap[key][c.category] || 0) + 1
      if (!catchMap[key].photo_url && c.bait_photo_url) catchMap[key].photo_url = c.bait_photo_url
    })
  })

  const rodBaitMap = {}
  const sessionsByBaitKey = {}
  function registerSessionUsage(key, session) {
    if (!key) return
    if (!sessionsByBaitKey[key]) sessionsByBaitKey[key] = new Map()
    sessionsByBaitKey[key].set(session.id, session)
  }
  sessions.forEach((s) => {
    const guessCategory = TYPE_CATEGORY[s.type] || null
    ;(s.rods || []).forEach((r) => {
      const names = []
      ;(r.baits || []).forEach((b) => { if (b.name) names.push({ name: b.name.trim(), photo_url: b.photo_url || null }) })
      if ((!r.baits || r.baits.length === 0) && r.bait) r.bait.split(',').forEach((n) => { const t = n.trim(); if (t) names.push({ name: t, photo_url: r.bait_photo_url || null }) })
      names.forEach(({ name, photo_url }) => {
        const key = name.toLowerCase()
        if (!key) return
        if (!rodBaitMap[key]) rodBaitMap[key] = { label: name, photo_url, category: guessCategory }
        if (!rodBaitMap[key].photo_url && photo_url) rodBaitMap[key].photo_url = photo_url
        registerSessionUsage(key, s)
      })
    })
    ;(s.catches || []).forEach((c) => {
      if (c.bait) registerSessionUsage(c.bait.trim().toLowerCase(), s)
    })
  })

  const merged = {}
  Object.entries(rodBaitMap).forEach(([key, v]) => {
    merged[key] = { key, label: v.label, photo_url: v.photo_url, catches: [], category: v.category || 'dravec', catalogEntry: null }
  })
  Object.entries(catchMap).forEach(([key, v]) => {
    const existing = merged[key]
    merged[key] = {
      key, label: v.catches[0]?.bait?.trim() || existing?.label || key,
      photo_url: v.photo_url || existing?.photo_url || null, catches: v.catches,
      category: (v.dravec || 0) >= (v.bila || 0) ? 'dravec' : (existing?.category || 'bila'),
      catalogEntry: null,
    }
  })
  baitCatalog.forEach((b) => {
    const key = b.name.trim().toLowerCase()
    const existing = merged[key]
    merged[key] = {
      key, label: b.name.trim(),
      photo_url: b.photo_url || existing?.photo_url || null,
      catches: existing?.catches || [],
      category: b.category || existing?.category || 'dravec',
      catalogEntry: b,
    }
  })

  return Object.values(merged).map((b) => ({
    ...b,
    sessionsUsed: Array.from((sessionsByBaitKey[b.key] || new Map()).values()),
  }))
}

export default function BaitsModal({ sessions, baitCatalog, groupId, userId, initialBaitKey, startAdding = false, onCatalogChanged, onRenamePropagate, onRemoveFromRods, onBackfillBaitPhoto, onClose, onOpenCatch, onOpenSession }) {
  const [selectedKey, setSelectedKey] = useState(initialBaitKey || null)
  const [adding, setAdding] = useState(startAdding)
  const [editingCatalogId, setEditingCatalogId] = useState(null)

  const baits = computeBaitsList(sessions, baitCatalog)
  const selected = baits.find((b) => b.key === selectedKey)

  async function handleCatalogChanged() {
    await onCatalogChanged?.()
  }

  // ---------- detail nástrahy ----------
  if (selected) {
    const canEditCatalog = selected.catalogEntry && selected.catalogEntry.created_by === userId
    const usedSessionIds = new Set(selected.catches.map((c) => c.sessionRef.id))
    const sessionsWithoutCatch = selected.sessionsUsed.filter((s) => !usedSessionIds.has(s.id))
    const inUse = selected.catches.length > 0 || selected.sessionsUsed.length > 0

    async function handleDelete() {
      if (inUse) {
        const dates = [...new Set([
          ...selected.catches.map((c) => c.sessionRef.session_date),
          ...selected.sessionsUsed.map((s) => s.session_date),
        ])]
        alert(`Nástraha "${selected.label}" je použitá (${dates.join(', ')}) — nejde smazat, dokud je zapsaná ve výpravě nebo úlovku.`)
        return
      }
      if (!window.confirm(`Nástraha "${selected.label}" není nikde použitá. Smazat ji z katalogu?`)) return
      if (selected.catalogEntry) await supabase.from('baits').delete().eq('id', selected.catalogEntry.id)
      await handleCatalogChanged()
      onClose()
    }

    if (editingCatalogId) {
      return (
        <EditBaitForm
          bait={selected}
          groupId={groupId}
          userId={userId}
          onRenamePropagate={onRenamePropagate}
          onBackfillBaitPhoto={onBackfillBaitPhoto}
          onCancel={() => setEditingCatalogId(null)}
          onSaved={async () => { setEditingCatalogId(null); await handleCatalogChanged() }}
        />
      )
    }
    return (
      <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="ticket" style={{ maxWidth: 440 }}>
          <div className="ticket-top">
            <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
            <div className="eyebrow">Nástraha</div>
            <h2>{selected.label}</h2>
          </div>
          <div className="perforation"></div>
          <div className="ticket-body">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="new-btn" onClick={onClose}>← Zpět na nástrahy</button>
              {(selected.catalogEntry ? canEditCatalog : true) && (
                <button className="new-btn" onClick={() => setEditingCatalogId(selected.key)}><IconEdit size={13} /> Upravit</button>
              )}
              {(selected.catalogEntry ? canEditCatalog : true) && (
                <button className="new-btn danger-btn" onClick={handleDelete}><IconTrash size={13} /> Smazat</button>
              )}
            </div>
            {selected.photo_url ? (
              <div className="ticket-illustration">
                <img src={selected.photo_url} alt={selected.label} className="catch-photo" />
              </div>
            ) : (
              <div className="ticket-illustration">
                <div style={{ width: 100 }} dangerouslySetInnerHTML={{ __html: fishSVG(CATEGORY_COLOR[selected.category]) }} />
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              {selected.catches.length === 0 ? 'Zatím na tuto nástrahu nic nechyceno.' : `${selected.catches.length} chycených ryb na tuto nástrahu`}
            </p>
            {selected.catches.length > 0 && (
              <div className="catch-list" style={{ maxHeight: 'none' }}>
                {selected.catches
                  .sort((a, b) => (b.caught_at || b.sessionRef.session_date || '').localeCompare(a.caught_at || a.sessionRef.session_date || ''))
                  .map((c) => (
                    <div key={c.id} className="catch-row" onClick={() => onOpenCatch(c, selected.key)}>
                      <div className="fish-mini" dangerouslySetInnerHTML={{ __html: fishSVG(CATEGORY_COLOR[c.category]) }} />
                      <div style={{ flex: 1 }}>
                        <div className="c-name">{c.species}</div>
                        <div className="c-sub">{c.length_cm ?? '—'} cm · {c.sessionRef.session_date}</div>
                        <div
                          className="c-sub link-val"
                          style={{ marginTop: 2 }}
                          onClick={(e) => { e.stopPropagation(); onOpenSession(c.sessionRef.id) }}
                        >
                          {c.sessionRef.title} →
                        </div>
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
          </div>
        </div>
      </div>
    )
  }

  // ---------- formulář na novou nástrahu ----------
  if (adding) {
    return (
      <AddBaitForm
        groupId={groupId}
        userId={userId}
        onCancel={onClose}
        onSaved={async () => { setAdding(false); await handleCatalogChanged(); onClose() }}
      />
    )
  }

  // ---------- fallback (normálně se sem nedostaneme -- appka vždycky otevírá
  // buď konkrétní nástrahu, nebo rovnou formulář na přidání; seznam žije v
  // postranním panelu, viz Dashboard.jsx renderBaitsList()) ----------
  return (
    <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ticket" style={{ maxWidth: 380 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
          <div className="eyebrow">Nástrahy</div>
          <h2>Nic není vybráno</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Vyber nástrahu ze seznamu v panelu „🪱 Nástrahy".</p>
        </div>
      </div>
    </div>
  )
}

function AddBaitForm({ groupId, userId, onCancel, onSaved }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('dravec')
  const [photoFile, setPhotoFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    let photo_url = null
    let photo_thumb_url = null
    if (photoFile) {
      const uploaded = await uploadPhoto(photoFile, `baits/catalog`)
      if (uploaded) { photo_url = uploaded.url; photo_thumb_url = uploaded.thumbUrl }
    }
    const { error } = await supabase.from('baits').insert({
      group_id: groupId, created_by: userId, name, category, photo_url, photo_thumb_url,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <div className="side-panel">
      <div className="ticket" style={{ maxWidth: 380 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onCancel}><IconClose size={16} /></button>
          <div className="eyebrow">Nová nástraha</div>
          <h2>Přidat do katalogu</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <form onSubmit={handleSubmit}>
            <label className="field-label">Název</label>
            <input className="text-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Boilie tuňák 20mm" autoFocus />
            <label className="field-label">Kategorie</label>
            <select className="text-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="dravec">Dravec</option>
              <option value="bila">Bílá ryba</option>
            </select>
            <label className="field-label">Foto (nepovinné)</label>
            <label className="photo-label" style={{ display: 'inline-block', marginTop: 4 }}>
              <IconCamera size={13} />{' '}{photoFile ? photoFile.name : 'vybrat foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => setPhotoFile(e.target.files[0])} />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Ukládám…' : 'Přidat nástrahu'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}

function EditBaitForm({ bait, groupId, userId, onRenamePropagate, onBackfillBaitPhoto, onCancel, onSaved }) {
  const [name, setName] = useState(bait.label)
  const [category, setCategory] = useState(bait.category)
  const [photoFile, setPhotoFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    let photo_url = bait.photo_url
    let photo_thumb_url = bait.photo_thumb_url
    if (photoFile) {
      const uploaded = await uploadPhoto(photoFile, `baits/catalog`)
      if (uploaded) { photo_url = uploaded.url; photo_thumb_url = uploaded.thumbUrl }
    }
    const renamed = name.trim().toLowerCase() !== bait.label.trim().toLowerCase()
    let error
    if (bait.catalogEntry) {
      ;({ error } = await supabase.from('baits').update({ name, category, photo_url, photo_thumb_url }).eq('id', bait.catalogEntry.id))
    } else {
      ;({ error } = await supabase.from('baits').insert({ group_id: groupId, created_by: userId, name, category, photo_url, photo_thumb_url }))
    }
    if (!error && renamed) {
      await onRenamePropagate?.(bait.label, name)
    }
    if (!error && photo_url) {
      const result = await onBackfillBaitPhoto?.(name, photo_url, photo_thumb_url)
      if (result && result.blocked > 0) {
        setError(`Foto se propsalo u ${result.updated} tvých záznamů. U ${result.blocked} se to nepodařilo — nejspíš patří jinému členovi party, ne tobě.`)
      }
    }
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <div className="side-panel">
      <div className="ticket" style={{ maxWidth: 380 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onCancel}><IconClose size={16} /></button>
          <div className="eyebrow">Úprava</div>
          <h2>{bait.label}</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          {!bait.catalogEntry && (
            <p className="help-note" style={{ marginBottom: 10 }}>
              Appka tuhle nástrahu zatím jen "odhadla" z tvé výpravy — nemá svůj vlastní záznam v katalogu. Uložením ho vytvoříš.
            </p>
          )}
          <form onSubmit={handleSubmit}>
            <label className="field-label">Název</label>
            <input className="text-input" required value={name} onChange={(e) => setName(e.target.value)} />
            <p className="help-note">Přejmenování se propíše i do výprav a úlovků, kde je tahle nástraha zapsaná — ale jen u tvých vlastních (kamarádovy záznamy nemůžeš upravovat).</p>
            <label className="field-label">Kategorie</label>
            <select className="text-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="dravec">Dravec</option>
              <option value="bila">Bílá ryba</option>
            </select>
            <label className="field-label">Foto</label>
            <label className="photo-label" style={{ display: 'inline-block', marginTop: 4 }}>
              <IconCamera size={13} />{' '}{photoFile ? photoFile.name : (bait.photo_url ? 'změnit foto' : 'vybrat foto')}
              <input type="file" accept="image/*" hidden onChange={(e) => setPhotoFile(e.target.files[0])} />
            </label>
            {bait.photo_url && !photoFile && <img src={bait.photo_url} alt="" className="bait-thumb" />}
            {error && <p className="error-text">{error}</p>}
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Ukládám…' : 'Uložit'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
