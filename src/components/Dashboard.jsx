import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import { supabase } from '../supabaseClient'
import CatchTicket from './CatchTicket.jsx'
import HelpModal from './HelpModal.jsx'
import BaitsModal, { computeBaitsList } from './BaitsModal.jsx'
import { IconVyprava, IconRevir, IconNastraha, IconUlovek, IconMenu, IconTrophy, IconChart, IconDownload, IconHelp, IconSettings, IconEdit, IconTrash, IconCamera, IconCalendar, IconDuplicate, IconTarget, IconThermometer, IconGauge, IconDroplet, IconWind, IconCheck, IconClose, IconSearch, IconMapEdit, IconBookmark, IconLive, IconZoom, IconRefresh, IconTrend, IconOffline, IconLocate, IconMoonPhase, IconPressureTrend, IconBoat, IconRiverAuto, IconBell, IconHome, IconMap, IconClock, IconApprox } from '../lib/icons.jsx'
import BaitPicker from './BaitPicker.jsx'
import LocationsModal from './LocationsModal.jsx'
import { fetchWeather, moonPhaseName } from '../lib/weather.js'
import { fetchWaterConditions, fetchLiveConditions, findNearestStations, WATER_PRECISION_LABEL, SPA_LEVEL_INFO } from '../lib/hydrology.js'
import { estimateWeightKg, hasWeightEstimate } from '../lib/weightEstimate.js'
import { crossesMidnight, actualDateForTime, sessionDurationMinutes, formatDurationHM, nowHHMM } from '../lib/sessionTime.js'
import { uploadPhoto } from '../lib/storage.js'
import { buildRiverAreasFromLine } from '../lib/riverShape.js'
import { useLockBodyScroll } from '../lib/useLockBodyScroll.js'

const iconCarp = `<svg viewBox="0 0 24 24" fill="none"><path d="M3 12c0-4 5-7 10-7s8 3 8 7-3 7-8 7-10-3-10-7Z" stroke="#2C6E71" stroke-width="1.6"/><circle cx="16" cy="10.5" r="1" fill="#2C6E71"/></svg>`
const iconSpin = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 20 L18 6" stroke="#6B7A4F" stroke-width="1.8"/><circle cx="4" cy="20" r="2" stroke="#6B7A4F" stroke-width="1.6"/><path d="M18 6 l3 -1 -1 3" stroke="#6B7A4F" stroke-width="1.6"/></svg>`
// Appka dřív měla jen tyhle dvě ikony -- appka vše kromě kapra
// dostávalo `iconSpin`. Doplněny vlastní ikony pro muška/plavaná/jiné,
// `iconSpin` zůstává jen pro `privlac`.
const iconMuska = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 C9 6 9 10 12 21" stroke="#B97F35" stroke-width="1.6"/><path d="M12 6 L8 8 M12 9 L7 11 M12 12 L8 14 M12 15 L9 17" stroke="#B97F35" stroke-width="1.2"/><path d="M12 18 q2 2 0 3" stroke="#B97F35" stroke-width="1.4" fill="none"/></svg>`
const iconPlavana = `<svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="9" rx="3" ry="5" stroke="#6B7A4F" stroke-width="1.6"/><path d="M12 14 L12 19 Q12 21 14 21" stroke="#6B7A4F" stroke-width="1.4" fill="none"/><circle cx="9" cy="9" r="0.9" fill="#6B7A4F"/></svg>`
const iconJine = `<svg viewBox="0 0 24 24" fill="none"><path d="M3 20 L18 4" stroke="#5B5F52" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="4" r="1.6" stroke="#5B5F52" stroke-width="1.4"/></svg>`
const SESSION_TYPE_ICON = { kapr: iconCarp, privlac: iconSpin, muska: iconMuska, plavana: iconPlavana, jine: iconJine }
const fishSVG = (color) => `
  <svg viewBox="0 0 64 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M4,17 C4,8 18,3 32,3 C46,3 58,9 60,17 C58,25 46,31 32,31 C18,31 4,26 4,17 Z" fill="${color}"/>
    <path d="M4,17 L-6,8 L-6,26 Z" fill="${color}"/>
    <circle cx="46" cy="14" r="2.3" fill="#1a1a1a"/>
  </svg>`
const rodColors = ['#2C6E71', '#B97F35', '#6B7A4F', '#D9A054']
const USER_PALETTE = [
  '#2C6E71', '#B4432E', '#6B7A4F', '#8A4B6B', '#3F6B9E', '#C9A227', '#4B7A2E', '#7A3F5E',
  '#2E8B8B', '#D1622F', '#5C4B8A', '#8A2E3E', '#3E8E5A', '#9C4F96', '#4A6B8A', '#A65A2E',
]
const CATEGORY_COLOR = { dravec: '#5C7A85', bila: '#C4A572' }
const SESSION_TYPES = [
  { value: 'kapr', label: 'Kapři' },
  { value: 'privlac', label: 'Přívlač' },
  { value: 'muska', label: 'Muška' },
  { value: 'plavana', label: 'Plavaná' },
  { value: 'jine', label: 'Jiné' },
]
// AREA_TYPES zůstává prázdné -- appka už u ŽÁDNÉHO typu nekreslí plochu u
// NOVÝCH výprav (přívlač byl poslední, co ji používal). Staré výpravy s už
// uloženou plochou appka nijak neničí ani nepřepočítává, jen appka u nich
// přes tenhle seznam (teď prázdný) víc nenabízí "Upravit oblasti" -- appka
// zůstává čitelná/zobrazitelná beze změny.
const AREA_TYPES = []
// LURE_TYPES je nezávislé na kreslení -- appka ho používá jen pro věci,
// co s plochou/bodem nesouvisí (pole "Cíl", popisek "Místo" místo "Prut").
const LURE_TYPES = ['privlac']
// Užší konstanta jen pro kreslení bodů na mapě: muška se má na mapě
// chovat jako přívlač (jen bod "kde stojím", žádné prutové kolečko
// navíc), ale jinde v appce (popisky "Prut"/"Místo", chování formulářů...)
// zůstává bodovým typem -- to pořád řeší LURE_TYPES beze změny.
const MAP_LURE_LOOK_TYPES = ['privlac', 'muska']
const TYPE_CATEGORY = { kapr: 'bila', privlac: 'dravec', muska: 'dravec', plavana: 'bila', jine: null }

// --- sloučení názvu/revíru víc katalogových míst do jednoho popisku výpravy ---
// Stejná "voda" (část názvu před " - ") se sloučí do jednoho: "Labe - Vaflák, soutok".
// Různá voda se vypíše zvlášť: "Labe - soutok, Jizera - Otradovice".
function mergeLocationNames(locations) {
  const groups = []
  locations.forEach((loc) => {
    const name = (loc.name || '').trim()
    const dashIdx = name.indexOf(' - ')
    const prefix = dashIdx === -1 ? null : name.slice(0, dashIdx)
    const suffix = dashIdx === -1 ? name : name.slice(dashIdx + 3)
    const existing = prefix ? groups.find((g) => g.prefix === prefix) : null
    if (existing) {
      if (!existing.suffixes.includes(suffix)) existing.suffixes.push(suffix)
    } else {
      groups.push({ prefix, suffixes: [suffix] })
    }
  })
  return groups.map((g) => (g.prefix ? `${g.prefix} - ${g.suffixes.join(', ')}` : g.suffixes[0])).join(', ')
}

// Revíry unikátně, v pořadí prvního výskytu podle výběru.
function mergeLocationRevirs(locations) {
  const seen = []
  locations.forEach((loc) => { if (loc.revir && !seen.includes(loc.revir)) seen.push(loc.revir) })
  return seen.join(', ') || null
}

// Pokud má výprava/úlovek navázané právě jedno katalogové místo a to místo má
// ručně potvrzenou/přiřazenou stanici ČHMÚ, použije se ta -- appka pak
// NEPŘEPOČÍTÁVÁ nejbližší stanici znovu podle souřadnic (to by přepsalo
// ruční opravu v katalogu).
// Hledání appky ignoruje diakritiku i velikost písmen ("dousa" najde "Douša").
function normalizeSearchText(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Odvodí jméno řeky ze jména revíru/výpravy -- oficiální jména revírů
// konvenčně začínají jménem řeky ("Labe 18", "Jizera - Kárany"), appka
// vezme první slovo před případnou pomlčkou. Použije se jako nápověda
// pro findNearestStations, ať appka u míst blízko dvou různých řek
// (soutoky, souběžné toky) neskočí na nejbližší stanici bez ohledu na
// to, na které řece leží.
function extractRiverName(name) {
  if (!name) return null
  const beforeDash = name.split(/[-–]/)[0].trim()
  return beforeDash.split(/\s+/)[0] || null
}

function resolveHydroStation(linkedLocationIds, locationsCatalog) {
  if (!linkedLocationIds || linkedLocationIds.length !== 1) return null
  const loc = locationsCatalog.find((l) => l.id === linkedLocationIds[0])
  if (!loc?.hydro_station_id) return null
  return { objID: loc.hydro_station_id, name: loc.hydro_station_name, stream: loc.hydro_stream_name }
}

// Stejné jako výše, ale vrací VŠECHNY odlišné potvrzené stanice napříč
// navázanými místy (bez duplicit) -- pro výpravu složenou z víc míst, kde
// každé může mít svou vlastní stanici (jiný revír, jiná řeka).
function resolveHydroStations(linkedLocationIds, locationsCatalog) {
  if (!linkedLocationIds?.length) return []
  const seen = new Map()
  linkedLocationIds.forEach((id) => {
    const loc = locationsCatalog.find((l) => l.id === id)
    if (loc?.hydro_station_id && !seen.has(loc.hydro_station_id)) {
      seen.set(loc.hydro_station_id, { objID: loc.hydro_station_id, name: loc.hydro_station_name, stream: loc.hydro_stream_name })
    }
  })
  return Array.from(seen.values())
}

// Najde stanici ČHMÚ podle STEJNÉHO čísla revíru, co appka už dřív měla
// ručně potvrzené u JINÉHO místa v katalogu -- appka ji hledá i bez
// ohledu na to, jestli je aktuální bod s tímhle katalogovým záznamem
// vůbec geometricky (GPS) propojený. Řeší situace u soutoků/souběžných
// toků, kdy appka podle vzdušné vzdálenosti bez tohohle najde nejbližší
// stanici sice fyzicky nejblíž, ale na jiné řece, než na které revír
// fakticky leží -- pokud appka tenhle revír se správnou stanicí už
// jednou měla (ručně potvrzeno přes persistStationChoice), použije ji
// appka znovu místo nového hádání podle vzdálenosti.
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

export default function Dashboard({ groupId, userId, profile, isDemoGroup, onSignOut }) {
  const [sessions, setSessions] = useState([])
  // Index aktivity ryb na Domů -- appka porovná DNEŠNÍ podmínky (fáze
  // měsíce, tlak, trend tlaku, vodní stav u appce nejbližší stanice) s
  // vlastní historií úlovků party, zvlášť pro dravce a zvlášť pro bílou
  // rybu (stejné rozdělení appka používá v "Kdy se daří" ve Statistikách).
  // Appka to fetchuje jen JEDNOU po prvním načtení výprav (todayIndexFetchedRef),
  // ne při každém loadSessions -- appka nechce zbytečně bušit appčino
  // počasí/ČHMÚ API při každém uložení úlovku.
  const [todayIndex, setTodayIndex] = useState({ status: 'loading' })
  const todayIndexFetchedRef = useRef(false)
  const [activeId, setActiveId] = useState(null)
  const activeIdRef = useRef(null)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeUserFilter, setActiveUserFilter] = useState('all')
  const [members, setMembers] = useState([])
  // Od kdy appka počítá statistiky jako "spolehlivé" (Celkem) -- výchozí
  // je datum vzniku skupiny (groups.stats_since, migrace 17), appka to
  // appce nechá zeptat v SettingsModal, kdyby to chtěl uživatel ručně
  // posunout (např. appku začal reálně používat až pár týdnů po
  // založení skupiny).
  const [groupInfo, setGroupInfo] = useState(null)
  const [viewMode, setViewMode] = useState('aggregate') // 'aggregate' | 'detail'
  const [myProfile, setMyProfile] = useState(profile)
  const [showNotifications, setShowNotifications] = useState(false)
  // Mapové vrstvy appka dřív řešila jako 4 nezávislá zaškrtávátka (moje/party
  // × výpravy/úlovky) -- to je fakticky mřížka Kdo × Co, jen appka nutila
  // uvažovat nad kombinacemi zvlášť. Teď appka drží jen dvě jednoduché volby
  // (3 možnosti každá) a mapLayers níže je z nich jen odvozený tvar, ať
  // appka nemusí měnit vykreslovací logiku mapy pod tím.
  const [mapWho, setMapWho] = useState('both')   // 'me' | 'party' | 'both'
  // Appka tímhle drží "fokusovaný" režim mapy -- když appka přijde z detailu
  // jedné konkrétní výpravy, appka radši ukáže JEN tuhle výpravu (všechny
  // její body + její úlovky), ne appku zaostřenou uprostřed hromady cizích
  // výprav ze všech vrstev. Appka to appce vyčistí zpátky na null, kdykoli
  // appka přepne panel běžnou cestou (viz switchPanel) nebo appka klikne na
  // tlačítko "Celá mapa".
  const [mapFocusSessionId, setMapFocusSessionId] = useState(null)
  // Volitelný doplněk k mapFocusSessionId -- když appka přijde z kliknutí
  // na konkrétní souřadnicový chip (jeden prut/místo), appka se přiblíží
  // rovnou na tenhle bod, ne jen na "vejde se celá výprava".
  const [mapFocusPoint, setMapFocusPoint] = useState(null) // {lat, lng, zoom}
  // Druhý klik na už aktivní záložku Mapa appku vrátí do výchozího stavu.
  const mapForceResetRef = useRef(false)
  // Donutí mapový efekt spustit se znovu i v případě, že se ani jedna
  // sledovaná hodnota (Kdo/Co filtr) druhým klikem doopravdy nezměnila --
  // bez týhle pojistky by React render přeskočil, protože by nic v
  // dependency poli nevypadalo jinak.
  const [mapResetNonce, setMapResetNonce] = useState(0)
  const [mapWhat, setMapWhat] = useState('catches') // 'trips' | 'catches' | 'both'
  const mapLayers = useMemo(() => ({
    myTrips: (mapWho === 'me' || mapWho === 'both') && (mapWhat === 'trips' || mapWhat === 'both'),
    partyTrips: (mapWho === 'party' || mapWho === 'both') && (mapWhat === 'trips' || mapWhat === 'both'),
    myCatches: (mapWho === 'me' || mapWho === 'both') && (mapWhat === 'catches' || mapWhat === 'both'),
    partyCatches: (mapWho === 'party' || mapWho === 'both') && (mapWhat === 'catches' || mapWhat === 'both'),
  }), [mapWho, mapWhat])
  // Domů: appka si pamatuje, kde uživatel scrolloval, ať se po odchodu a
  // návratu appka vrátí přesně tam (ne nahoru, ne doprostřed náhodně).
  // Druhý klik na už aktivní Domů appku naopak pošle nahoru, na nejnovější
  // úlovek -- viz switchPanel a efekt níže na [activePanel, homeNavNonce].
  const sidebarRef = useRef(null)
  // Výpravy na mobilu v klidu se drží mimo sidebarRef -- ukazují se přes
  // vlastní full-panel kontejner (mobile-sheet-body). Potřeba vlastní ref,
  // ať jde na druhý klik posunout na začátek i tenhle případ.
  const mobileSheetBodyRef = useRef(null)
  const homeScrollRef = useRef(0)
  const pendingHomeScrollModeRef = useRef('top')
  const [homeNavNonce, setHomeNavNonce] = useState(0)
  const [stationsList, setStationsList] = useState(null) // null = ještě nenačteno
  const [stationsLoading, setStationsLoading] = useState(false)
  const [expandedStationId, setExpandedStationId] = useState(null)
  const [stationConditions, setStationConditions] = useState({}) // {objID: {level_cm, flow_m3s, temp_c, spa_level}}
  const [gpsCapturing, setGpsCapturing] = useState(false)
  const [gpsConfirmStep, setGpsConfirmStep] = useState(null) // {point, matches} -- appka čeká na potvrzení/napsání jména
  const [gpsManualTitle, setGpsManualTitle] = useState('')
  const [gpsManualRevir, setGpsManualRevir] = useState('')
  const pendingGpsShorePointRef = useRef(null) // GPS bod na břehu -- použije se jako draftSession.point MÍSTO pozice prvního prutu
  const [locallyHandledLocationIds, setLocallyHandledLocationIds] = useState(new Set()) // "vyřešeno" jen pro tuhle jednu otevřenou session appky, ať notifikace nezůstane viset jako "nevyřízená" hned po kliknutí na Potvrdit
  const notificationsRef = useRef(null)
  const [showBaits, setShowBaits] = useState(false)
  const [showLocations, setShowLocations] = useState(false)
  const [baitsInitialKey, setBaitsInitialKey] = useState(null)
  const [locationsReturnId, setLocationsReturnId] = useState(null)
  const [baitCatalog, setBaitCatalog] = useState([])
  const [locationsCatalog, setLocationsCatalog] = useState([])
  const [savingLocationFor, setSavingLocationFor] = useState(null) // {title, revir, area, lat, lng} — normalizovaný zdroj pro uložení do katalogu
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  // Lišta je teď normální blok v toku stránky, ne plovoucí overlay --
  // po rozbalení se tak nový obsah objeví DOLE (roste stránka), ne
  // nahoře přes mapu jako dřív. Appka proto po rozbalení sama
  // doscrolluje na tenhle blok, ať se nový obsah dostane do záběru.
  const mobileSheetRef = useRef(null)
  useEffect(() => {
    if (mobileSheetOpen && mobileSheetRef.current) {
      mobileSheetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [mobileSheetOpen])
  const [loading, setLoading] = useState(true)
  const [ticketCatch, setTicketCatch] = useState(null)
  const ticketCatchRef = useRef(null)
  useEffect(() => { ticketCatchRef.current = ticketCatch }, [ticketCatch])
  const pendingTicketCatchIdRef = useRef(null)
  const [inviteInfo, setInviteInfo] = useState(null)

  // --- flow state pro vytváření nové výpravy ---
  const [pickingType, setPickingType] = useState(false)         // ukazuje mini panel "jaký typ?"
  const [locationPickerStep, setLocationPickerStep] = useState(null) // null | 'choose' | 'catalog' | 'attach'
  const [pickingCatalogIds, setPickingCatalogIds] = useState([])
  const [locationActionMenuFor, setLocationActionMenuFor] = useState(null) // uložená výprava, pro kterou se ukazuje menu 📍 Místo
  const [attachingLocationsSessionId, setAttachingLocationsSessionId] = useState(null) // id výpravy, které se dodatečně mění navázaná místa
  const [areaDraft, setAreaDraft] = useState(null)               // {areas:[], current:[]} během kreslení oblasti
  const [areaDrawChoice, setAreaDrawChoice] = useState(null)     // {resumeTarget} — mezikrok "jak nakreslit oblast?" (ručně / podle břehu)
  const [riverLineDraft, setRiverLineDraft] = useState(null)     // {points:[]} — sbírání bodů středem toku pro auto tvar podle břehu
  const [riverConfirm, setRiverConfirm] = useState(null)         // {polygons:[...]} — výsledek čeká na potvrzení "Použít"/"Zkusit znovu"
  const [riverCorridorWidth, setRiverCorridorWidth] = useState(80)
  const [riverOvershoot, setRiverOvershoot] = useState(0)
  const [riverBusy, setRiverBusy] = useState(false)
  const [riverError, setRiverError] = useState(null)
  const [autoAdvancingArea, setAutoAdvancingArea] = useState(false) // potlačí "starý" areaDraft panel při automatickém navázání po potvrzení
  const riverResumeTargetRef = useRef(null)                      // kam se appka vrátí (placementTarget) po dokončení auto-kreslení
  const riverAbortRef = useRef(null)                             // umožní zrušit rozjeté generování (tlačítko Zrušit i uprostřed čekání)
  // Umožní přesně navázat novou vygenerovanou plochu na konec té PŘEDCHOZÍ
  // (stejný bod i sklon řezu, žádná mezera ani jiný úhel) -- funguje jen
  // v rámci jednoho běhu editace (paměť appky, ne uložené v DB), typicky
  // "vygeneruj úsek A, hned na něj naviaž úsekem B". Po zavření/uložení
  // celé editace místa se resetuje, ať appka omylem nenaváže na cizí/starý
  // kontext z úplně jiného místa.
  const lastRiverCutRef = useRef(null)                           // {cutPoint, dirPoints} konce poslední vygenerované plochy
  const sessionFirstStartCutRef = useRef(null)                   // start řezu PRVNÍ plochy vygenerované v týhle živé editaci -- uloží se s revírem, ať jde navázat i z jeho začátku
  const [riverSnapAvailable, setRiverSnapAvailable] = useState(false)
  const [riverSnapEnabled, setRiverSnapEnabled] = useState(true)
  const [snapSourceLabel, setSnapSourceLabel] = useState(null)    // text pro uživatele, na co přesně se teď naváže ("Labe - Vaflák (konec)" apod.)
  const [showCatalogSnapPicker, setShowCatalogSnapPicker] = useState(false)
  const pendingConfirmActionRef = useRef(null)                   // 'proceedToForm' | 'finishAppendArea' | 'proceedRelocateArea' — spustí se, až se areaDraft skutečně aktualizuje
  const suppressLocationsFitRef = useRef(false)                  // jednorázově potlačí "přeostři mapu na všechny revíry" hned po potvrzení/uložení konkrétní editované oblasti
  const suppressSessionFitRef = useRef(false)                    // jednorázově potlačí "přeostři mapu na bod výpravy" hned po přesunu bodu/přidání dalšího místa -- appka nechá mapu tak, jak si ji uživatel sám přiblížil při klikání
  const [rodPointsDraft, setRodPointsDraft] = useState(null)     // [{lat,lng}, ...] během sbírání pozic prutů (bodové typy)
  const [placementTarget, setPlacementTarget] = useState(null)   // 'session-point' | 'area-point' | 'rod-<i>' | 'catch-point'
  const [draftSession, setDraftSession] = useState(null)         // otevřený formulář nové výpravy
  const [draftCatch, setDraftCatch] = useState(null)             // otevřený formulář nového úlovku
  const [catchChoosing, setCatchChoosing] = useState(false)      // mini panel "na jaké pozici?"
  const [editingRodId, setEditingRodId] = useState(null)         // id prutu, co se právě edituje inline
  const [editingSession, setEditingSession] = useState(null)     // rozepsaná editace výpravy (datum, počasí...)
  const [editingAreasSession, setEditingAreasSession] = useState(null) // {id, areas:[]} — správa oblastí u uložené výpravy
  const [editingAreasLocation, setEditingAreasLocation] = useState(null) // {id, areas:[]} — správa oblastí u místa v katalogu
  const [activePanel, setActivePanel] = useState('home') // null | 'home' | 'map' | 'stations' | 'locations' | 'baits' | 'catches' | 'records' | 'stats' | 'help' | 'settings' — jen jeden panel může být aktivní najednou; appka se vždycky po otevření ukáže na Domů, ne se vrací tam, kde uživatel skončil naposled
  const [baitsStartAdding, setBaitsStartAdding] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false) // "☰ Více" — méně časté akce schované z hlavičky
  const moreMenuRef = useRef(null)
  const [showSessionMenu, setShowSessionMenu] = useState(false) // "⋯" u detailu výpravy — appka sem schovává "Nová jako tahle" / "Přesunout bod" / "Upravit výpravu", ať appka nemá v hlavičce detailu 4 tlačítka najednou ("Zobrazit na mapě" appka úplně zrušila -- k tomu slouží klikací mini-mapka hned pod tím)
  const sessionMenuRef = useRef(null)
  useEffect(() => {
    if (!showSessionMenu) return
    function handleClickOutside(e) {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target)) setShowSessionMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSessionMenu])
  useEffect(() => {
    if (!showMoreMenu) return
    function handleClickOutside(e) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setShowMoreMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoreMenu])
  useEffect(() => {
    if (!showNotifications) return
    function handleClickOutside(e) {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) closeNotifications()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifications])
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [toast, setToast] = useState(null) // krátké potvrzení "✓ Uloženo" po akci
  const [searchQuery, setSearchQuery] = useState('') // hledání ve výpravách (název, revír, druh, nástraha)
  const [catchesCategory, setCatchesCategory] = useState('all') // filtr dravec/bílá ryba v panelu Úlovky
  const [catchesSortMode, setCatchesSortMode] = useState('species') // 'species' | 'date' | 'user' -- appka defaultně řadí podle druhu, tam appka ukazuje rekord
  const [dateListLimit, setDateListLimit] = useState(30) // "Podle data" appka nevypíše najednou stovky řádků s fotkami -- nabídne appka je po dávkách (viz renderCatchesList)
  const [userGroupLimits, setUserGroupLimits] = useState({}) // "Podle rybáře" řeší stejný problém jako dateListLimit, ale appka to musí dělat PER RYBÁŘ -- jeden globální strop napříč partou by mohl skupinu druhého/třetího rybáře nechat vůbec nezobrazenou, kdyby appka limit vyčerpala už v seznamu prvního. Klíčem appka bere user_id, chybějící hodnotu bere jako DEFAULT_USER_GROUP_LIMIT (viz níž).
  const [speciesGalleryKey, setSpeciesGalleryKey] = useState(null) // otevřený druh v "poličce trofejí" -- null = appka ukazuje poličku, jinak celou galerii daného druhu

  useEffect(() => {
    function goOnline() { setIsOnline(true) }
    function goOffline() { setIsOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  // Appka přestala sama uzavírat/měřit viditelnou výšku (appka to
  // zkoušela přes "100dvh" i přes výšku naměřenou pomocí visualViewport,
  // ani jedno se neukázalo spolehlivé napříč Safari/Chrome/appkou na
  // ploše). Appka se místo toho nechá chovat jako normální webová
  // stránka -- appka se nikam nezamyká, appka nechá scrollovat celou
  // stránku a spoléhá na nativní chování prohlížeče (stejně
  // jako běžná stránka, třeba Seznam.cz).

  // Spodní navigační lištu appka ukazuje jen v appce nainstalované na
  // plochu (žádná lišta prohlížeče kolem) -- v běžné záložce appka
  // navigaci nechá nahoře v hlavičce, jako appka fungovala předtím.
  // appka pozná nainstalovanou verzi přes "window.navigator.standalone" (specifický iOS
  // příznak, spolehlivější než jen CSS "display-mode: standalone") a
  // uloží to jako třídu na <html>, ať appka může v CSS rozlišit obě
  // situace jednoduchým selektorem.
  useEffect(() => {
    const isStandalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches
    document.documentElement.classList.toggle('standalone-app', isStandalone)
  }, [])

  // Demo skupina je jen pro prohlížení -- appka centrálně (na úrovni
  // celého dokumentu, v CAPTURE fázi, tedy DŘÍV než klik doputuje k
  // libovolnému React onClick handleru) odchytí kliknutí na tlačítka se
  // třídou btn-primary (uložit/vytvořit) nebo danger-btn (smazat) a
  // appka ho zastaví -- namísto aby appka musela každý z těch zápisů
  // (nová výprava, úlovek, nástraha, prut, revír, smazání čehokoli...)
  // procházet a upravovat zvlášť. Skutečnou pojistkou proti zápisu
  // zůstává RLS politika v Supabase (řeší appka nezávisle na tomhle) --
  // tohle appka dělá jen kvůli hezčímu chování v appce samotné, ať
  // uživatel dostane rovnou srozumitelnou českou hlášku, ne technickou
  // chybu z Postgresu.
  useEffect(() => {
    if (!isDemoGroup) return
    function blockWrites(e) {
      const target = e.target.closest('.btn-primary, .new-btn.danger-btn')
      if (!target) return
      e.preventDefault()
      e.stopPropagation()
      showToast('Demo appka je jen pro prohlížení -- založ si vlastní appku, ať můžeš zapisovat.')
    }
    document.addEventListener('click', blockWrites, true)
    return () => document.removeEventListener('click', blockWrites, true)
  }, [isDemoGroup])

  // --real-vh: appka na živém testu (na displeji zobrazená diagnostická
  // zjistila, že window.innerHeight/visualViewport.height -- na kterých
  // staví CSS jednotka "dvh" -- se na iOS po zamknutí/odemknutí scrollu
  // (useLockBodyScroll) občas zaseknou na chybně MALÉ hodnotě (naměřeno
  // konkrétně 797 místo skutečných 844 px). Spodní lišta s "bottom:0" pak
  // skončí o tenhle rozdíl výš, než má, a dole je vidět kousek podkladové
  // barvy. window.screen.height je fyzický rozměr displeje -- appka ho
  // nemá jak mít nikdy špatně, na rozdíl od viewportu -- appka ho proto
  // uloží jako CSS proměnnou a použije místo dvh tam, kde na přesnou
  // výšku obrazovky záleží (viz .app a .bottom-tab-bar ve styles.css).
  useEffect(() => {
    function updateRealVh() {
      // screen.width/height appka bere podle PŘIROZENÉ orientace telefonu
      // (na výšku je screen.height ta delší strana) -- appka proto podle
      // toho, jestli je zrovna okno širší než vyšší (na šířku), vezme tu
      // odpovídající stranu z obou hodnot displeje.
      const isLandscapeNow = window.innerWidth > window.innerHeight
      const screenLonger = Math.max(window.screen.width, window.screen.height)
      const screenShorter = Math.min(window.screen.width, window.screen.height)
      const h = isLandscapeNow ? screenShorter : screenLonger
      document.documentElement.style.setProperty('--real-vh', `${h}px`)
    }
    updateRealVh()
    window.addEventListener('orientationchange', updateRealVh)
    window.addEventListener('resize', updateRealVh)
    return () => {
      window.removeEventListener('orientationchange', updateRealVh)
      window.removeEventListener('resize', updateRealVh)
    }
  }, [])



  function showToast(message) {
    setToast(message)
    setTimeout(() => setToast(null), 2200)
  }

  const placementTargetRef = useRef(null)
  useEffect(() => { placementTargetRef.current = placementTarget }, [placementTarget])

  // handleMapClick appka registruje na mapu JEN JEDNOU (map.on('click', ...)
  // uvnitř useEffectu s prázdným dependency polem, viz inicializace mapy
  // níže) -- kdyby appka volala handleMapClick přímo, natrvalo by si
  // "zamrzla" na verzi z PRVNÍHO renderu, se sessions/locationsCatalog
  // takovými, jaké byly při načtení appky (typicky prázdné, než doběhne
  // async načtení dat). Starší větve (klikání prutů, kreslení oblastí)
  // tohle nepocítily, protože používají funkcionální setX(prev => ...)
  // zápis, který se zamrznutí vyhne -- ale novější kód (findNearestHistoryMatches)
  // čte sessions/locationsCatalog přímo, a proto vždycky viděl stará data.
  // Řešení: appka na mapu registruje jen tenhle stabilní ref, a jeho
  // OBSAH (handleMapClickRef.current) appka přepisuje po KAŽDÉM renderu.
  const handleMapClickRef = useRef(null)

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const aggregateClusterLayer = useRef(null) // shlukovaná vrstva úlovků v souhrnném pohledu -- oddělená od markersLayer, protože ten drží i polygony/kruhy (revíry, detail výpravy), co shlukování nepodporuje
  const tripsClusterLayer = useRef(null) // shlukovaná vrstva výprav na záložce Mapa -- oddělená od úlovků, ať se čísla ve dvou různých kolečkách nemíchají dohromady
  const draftLayer = useRef(null)

  // Záložka Mapa má VLASTNÍ, samostatnou Leaflet instanci -- ne tu sdílenou
  // výše. Po opakovaných chybách, kdy si appka mapu na Výpravách přesouvala
  // pro potřeby umísťování bodů a tenhle přesun se pak nechtěně "propsal" i
  // do Mapy (bez ohledu na to, kolik pojistek appka přidala), je nejjistější
  // řešení mít dvě oddělené mapy, se kterými si appka nemůže vzájemně
  // šlapat na paty. Mapa tak přirozeně drží svou pozici sama -- nikdo jiný
  // s ní nehýbe, appka nepotřebuje žádné složité "zapamatuj/obnov".
  const mapTabRef = useRef(null)
  const mapTabInstance = useRef(null)
  const mapTabMarkersLayer = useRef(null)
  const mapTabAggregateClusterLayer = useRef(null)
  const mapTabTripsClusterLayer = useRef(null)
  const mapTabHasFitRef = useRef(false) // appka spočítá výchozí přiblížení jen jednou (nebo na výslovný reset), pak mapu nechá být

  // Na "Domů" appka mapu jen schová přes CSS (display:none), ne že by ji
  // odpojila z DOM -- Leaflet instance tak zůstává živá, jen si při
  // schování zapamatuje rozměry 0x0. Při návratu na panel s mapou je
  // potřeba Leafletu říct "přepočítej si rozměry znovu", jinak by se
  // dlaždice mohly vykreslit jen zčásti/špatně. Efekt je až níže v
  // souboru (za deklarací mapNeededForInteraction, kterou appka potřebuje
  // v dependency poli).

  // Domů: po vstupu appka nastaví scroll podle pendingHomeScrollModeRef --
  // 'top' (druhý klik na už aktivní Domů) appku pošle nahoru, 'restore'
  // (příchod odjinud) appku vrátí tam, kde uživatel scrolloval naposled.
  // homeNavNonce appce zaručí, že se efekt spustí i když activePanel
  // textově zůstává 'home' (druhý klik samotný by React jinak přeskočil).
  useEffect(() => {
    if (activePanel !== 'home' || !sidebarRef.current) return
    const top = pendingHomeScrollModeRef.current === 'top'
    sidebarRef.current.scrollTop = top ? 0 : (homeScrollRef.current || 0)
    if (top) window.scrollTo(0, 0)
  }, [activePanel, homeNavNonce])

  useEffect(() => { loadSessions(); loadMembers(); loadBaitCatalog(); loadLocationsCatalog(); loadGroupInfo() }, [groupId])

  async function loadGroupInfo() {
    const { data } = await supabase
      .from('groups')
      .select('id, name, created_at, stats_since')
      .eq('id', groupId)
      .single()
    if (data) setGroupInfo(data)
  }

  async function loadBaitCatalog() {
    const { data } = await supabase
      .from('baits')
      .select('*')
      .eq('group_id', groupId)
      .order('name')
    if (data) setBaitCatalog(data)
  }

  async function loadLocationsCatalog() {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('group_id', groupId)
      .order('name')
    if (data) {
      setLocationsCatalog(data)
      for (const loc of data) {
        if (loc.area && (loc.lat == null || loc.lng == null)) {
          const c = areaCentroid(loc.area.flat())
          await supabase.from('locations').update({ lat: c.lat, lng: c.lng }).eq('id', loc.id)
          loc.lat = c.lat
          loc.lng = c.lng
        }
      }
    }
  }

  async function loadMembers() {
    const { data } = await supabase
      .from('group_members')
      .select('user_id, role, joined_at, profiles(display_name, color)')
      .eq('group_id', groupId)
      .order('joined_at')
    // "visitor" je někdo, kdo si jen prohlíží demo appku přes pozvánkový
    // kód -- appka ho musí zapsat do group_members, aby vůbec směl číst
    // data (RLS), ale do žebříčku a seznamu členů nepatří, protože nejde
    // o skutečného člena party.
    if (data) setMembers(
      data
        .filter((m) => m.role !== 'visitor')
        .map((m) => ({ id: m.user_id, name: m.profiles?.display_name || '?', color: m.profiles?.color || null }))
    )
  }

  function userColor(uid) {
    const m = members.find((mm) => mm.id === uid)
    if (m?.color) return m.color
    const idx = members.findIndex((mm) => mm.id === uid)
    return idx === -1 ? '#5B5F52' : USER_PALETTE[idx % USER_PALETTE.length]
  }
  function userName(uid) {
    return members.find((m) => m.id === uid)?.name || '?'
  }

  // --- obnovení rozepsaného formuláře i toho, kde jsi byl (filtry, otevřená výprava/úlovek) ---
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const savedSession = localStorage.getItem(`draft_session_${groupId}`)
      if (savedSession) setDraftSession(JSON.parse(savedSession))
      const savedCatch = localStorage.getItem(`draft_catch_${groupId}`)
      if (savedCatch) setDraftCatch(JSON.parse(savedCatch))
      const savedLocation = localStorage.getItem(`draft_location_${groupId}`)
      if (savedLocation) setSavingLocationFor(JSON.parse(savedLocation))
      const savedNav = localStorage.getItem(`nav_state_${groupId}`)
      if (savedNav) {
        const nav = JSON.parse(savedNav)
        if (nav.activeCategory) setActiveCategory(nav.activeCategory)
        if (nav.activeUserFilter) setActiveUserFilter(nav.activeUserFilter)
        if (nav.activeId) setActiveId(nav.activeId)
        if (nav.viewMode) setViewMode(nav.viewMode)
        if (nav.ticketCatchId) pendingTicketCatchIdRef.current = nav.ticketCatchId
        // Appka rozlišuje "čerstvě otevřeno" (jde na Domů, nový přehled) od
        // "appka byla jen chvíli na pozadí, zatímco jsi třeba mrknul na název
        // revíru nebo nástrahy jinam" (zůstane přesně tam, kde jsi byl).
        // Rozepsaný formulář výpravy/úlovku appka obnovuje vždycky bez
        // ohledu na tohle -- viz draft_session/draft_catch výše.
        const RECENT_MS = 30 * 60 * 1000
        if ('activePanel' in nav && nav.savedAt && Date.now() - nav.savedAt < RECENT_MS) {
          setActivePanel(nav.activePanel)
        }
      }
    } catch { /* ignore */ }
  }, [groupId])

  useEffect(() => {
    localStorage.setItem(`nav_state_${groupId}`, JSON.stringify({
      activeCategory, activeUserFilter, activeId, viewMode, ticketCatchId: ticketCatch?.id || null,
      activePanel, savedAt: Date.now(),
    }))
  }, [activeCategory, activeUserFilter, activeId, viewMode, ticketCatch, activePanel, groupId])

  useEffect(() => {
    if (draftSession) {
      const stripped = { ...draftSession, rods: draftSession.rods.map((r) => ({ ...r, baits: (r.baits || []).map((b) => ({ name: b.name })) })) }
      localStorage.setItem(`draft_session_${groupId}`, JSON.stringify(stripped))
    } else {
      localStorage.removeItem(`draft_session_${groupId}`)
    }
  }, [draftSession, groupId])

  useEffect(() => {
    if (draftCatch) {
      const stripped = { ...draftCatch, photoFile: null }
      localStorage.setItem(`draft_catch_${groupId}`, JSON.stringify(stripped))
    } else {
      localStorage.removeItem(`draft_catch_${groupId}`)
    }
  }, [draftCatch, groupId])

  useEffect(() => {
    if (savingLocationFor) {
      localStorage.setItem(`draft_location_${groupId}`, JSON.stringify(savingLocationFor))
    } else {
      localStorage.removeItem(`draft_location_${groupId}`)
    }
  }, [savingLocationFor, groupId])

  // Appka tady záměrně kopíruje jen minimum logiky z "Kdy se daří" (žádná
  // hodinová bucketa, appka ji na Domů nepotřebuje) -- jen fáze měsíce,
  // tlak, trend tlaku a vodní stav, ty čtyři signály appce úplně stačí
  // na jednoduché "vysoká/střední/nízká".
  const INDEX_PRESSURE_BUCKETS = [
    { key: '<1000 hPa', test: (p) => p < 1000 },
    { key: '1000–1010 hPa', test: (p) => p >= 1000 && p < 1010 },
    { key: '1010–1020 hPa', test: (p) => p >= 1010 && p < 1020 },
    { key: '1020+ hPa', test: (p) => p >= 1020 },
  ]
  function pressureBucketKey(p) {
    const found = INDEX_PRESSURE_BUCKETS.find((b) => b.test(p))
    return found ? found.key : null
  }
  function trendKey(trend) {
    if (trend == null) return null
    return trend > 0 ? 'roste' : trend < 0 ? 'klesá' : 'stabilní'
  }

  // Appka spočítá pro danou kategorii (dravec/bila), jak moc dnešní
  // podmínky historicky "sedí" k úlovkům té kategorie. Appka to dělá jako
  // poměr "kolikrát to sedělo vůči uniformnímu očekávání" (1 = přesně
  // průměr, víc než 1 = nad průměrem) a zprůměruje přes všechny signály,
  // co appka o dnešku zná.
  function scoreCategoryIndex(category, sessionsData, today) {
    const byMoon = {}, byPressure = {}, byTrend = {}, bySpa = {}
    let total = 0
    sessionsData.forEach((s) => {
      ;(s.catches || []).forEach((c) => {
        if (c.category !== category) return
        total += 1
        const dateStr = c.caught_at ? c.caught_at.slice(0, 10) : s.session_date
        const phase = dateStr ? moonPhaseName(dateStr) : null
        if (phase) byMoon[phase] = (byMoon[phase] || 0) + 1
        const p = c.weather_pressure_hpa ?? s.weather_pressure_hpa
        if (p != null && p !== '') {
          const bk = pressureBucketKey(p)
          if (bk) byPressure[bk] = (byPressure[bk] || 0) + 1
        }
        const trend = c.weather_pressure_trend ?? s.weather_pressure_trend
        const tk = trendKey(trend)
        if (tk) byTrend[tk] = (byTrend[tk] || 0) + 1
        const sessionSpa = s.water_stations?.length > 0 ? s.water_stations[0].spa_level : s.water_spa_level
        const spa = c.water_spa_level ?? sessionSpa
        if (spa != null) bySpa[spa] = (bySpa[spa] || 0) + 1
      })
    })
    // appka vyžaduje aspoň 8 úlovků dané kategorie -- pod tím appka radši
    // ukáže "zatím málo dat", než aby appka počítala falešně sebejistý
    // výsledek z pár úlovků.
    if (total < 8) return { status: 'not_enough_data', total }

    function signalScore(byBucket, todayKey) {
      if (todayKey == null) return null
      const bucketCount = Object.keys(byBucket).length
      if (bucketCount === 0) return null
      const matched = byBucket[todayKey] || 0
      const sumMatched = Object.values(byBucket).reduce((a, b) => a + b, 0)
      if (sumMatched === 0) return null
      const ratio = matched / sumMatched
      const expected = 1 / bucketCount
      return ratio / expected
    }

    const scores = [
      signalScore(byMoon, today.moonPhase),
      signalScore(byPressure, today.pressureBucket),
      signalScore(byTrend, today.trendLabel),
      signalScore(bySpa, today.spaLevel),
    ].filter((v) => v != null)

    if (scores.length === 0) return { status: 'not_enough_data', total }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const level = avg >= 1.2 ? 'vysoká' : avg >= 0.8 ? 'střední' : 'nízká'
    return { status: 'ready', level, total }
  }

  async function loadTodayIndex(sessionsData) {
    try {
      const points = sessionsData.filter((s) => s.lat != null && s.lng != null)
      const ref = points.length
        ? { lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length, lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length }
        : { lat: 49.8, lng: 15.5 }
      const todayDateStr = new Date().toISOString().slice(0, 10)
      const moonPhase = moonPhaseName(todayDateStr)

      let pressureBucket = null, trendLabel = null
      try {
        const w = await fetchWeather(ref.lat, ref.lng, todayDateStr)
        pressureBucket = pressureBucketKey(w.pressure)
        trendLabel = trendKey(w.pressureTrend)
      } catch {
        // appka počasí nesehnala (offline appka podobně) -- appka jede
        // dál jen s fází měsíce.
      }

      let spaLevel = null
      try {
        const stations = await findNearestStations(ref.lat, ref.lng, 1)
        if (stations[0]) {
          const cond = await fetchLiveConditions(stations[0].objID)
          spaLevel = cond?.spa_level ?? null
        }
      } catch {
        // appka ČHMÚ nesehnala -- appka jede dál bez vodního stavu.
      }

      const today = { moonPhase, pressureBucket, trendLabel, spaLevel }
      setTodayIndex({
        status: 'ready',
        dravec: scoreCategoryIndex('dravec', sessionsData, today),
        bila: scoreCategoryIndex('bila', sessionsData, today),
      })
    } catch {
      setTodayIndex({ status: 'error' })
    }
  }

  async function loadSessions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .select('*, rods(*), catches(*), session_locations(location_id)')
      .eq('group_id', groupId)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) {
      setSessions(data)
      if (!todayIndexFetchedRef.current) {
        todayIndexFetchedRef.current = true
        loadTodayIndex(data)
      }
      if (data.length && !activeIdRef.current) setActiveId(data[0].id)
      if (pendingTicketCatchIdRef.current) {
        const targetId = pendingTicketCatchIdRef.current
        for (const s of data) {
          const found = (s.catches || []).find((c) => c.id === targetId)
          if (found) { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(found); break }
        }
        pendingTicketCatchIdRef.current = null
      } else if (ticketCatchRef.current) {
        // Oprava: appka po uložení úlovku obnovila data appky (sessions), ale
        // OTEVŘENÝ úlovkový lístek zůstával na staré verzi objektu -- appka pak
        // ukazovala "neuloženo", i když se do databáze vše uložilo správně.
        const targetId = ticketCatchRef.current.id
        for (const s of data) {
          const found = (s.catches || []).find((c) => c.id === targetId)
          if (found) { setTicketCatch(found); break }
        }
      }
    }
    setLoading(false)
  }

  const activeSession = sessions.find((s) => s.id === activeId) || null
  // appka tímhle zjišťuje, jestli má uživatel rozjetou živou výpravu -- podle
  // toho hlavičkové tlačítko vedle loga přepíná mezi "Chytám" (jantarová,
  // spustí novou živou výpravu) a "Probíhá" (pulzující červená, skočí zpátky
  // do detailu té rozjeté výpravy). Appka to schválně váže jen na vlastní
  // výpravu -- appka nemá důvod tady hlídat rozjeté výpravy zbytku party.
  const myLiveSession = sessions.find((s) => s.status === 'in_progress' && s.user_id === userId) || null
  const canEdit = activeSession && activeSession.user_id === userId
  const activeSessionRef = useRef(null)
  useEffect(() => { activeSessionRef.current = activeSession }, [activeSession])
  // Appka appce hlídá "zombie" activeId -- ukazuje na výpravu, která už v
  // načtených datech není (appka ji smazala, smazal ji jiný člen party,
  // nebo se activeId jen obnovilo ze staršího nav_state v localStorage).
  // Dřív appka v tomhle stavu zůstala viset na detailu prázdné/neexistující
  // výpravy a při dalším pokusu appka hlásila nepříjemnou chybu -- appka
  // teď sama, rovnou, přepne zpátky na přehled a appce to řekne.
  useEffect(() => {
    if (loading) return
    if (activeId && !sessions.some((s) => s.id === activeId)) {
      setActiveId(null)
      setViewMode('aggregate')
      showToast('Tahle výprava už neexistuje -- byla smazána.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, loading, activeId])
  const relocateSessionIdRef = useRef(null)
  const relocateCatchIdRef = useRef(null)
  const addRodToSessionRef = useRef(null) // {sessionId, type} -- výprava, ke které appka přidává nový prut/místo (funguje i u už uložené výpravy)
  const pendingMapFocusRef = useRef(null)

  function filteredCatches(session) {
    if (!session) return []
    if (activeCategory === 'all') return session.catches
    return session.catches.filter((c) => c.category === activeCategory)
  }

  // --- init map jednou ---
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = L.map(mapRef.current).setView([49.8, 15.5], 8)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Podklad: OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    markersLayer.current = L.layerGroup().addTo(map)
    // Vlastní styl shluku (kolečko s číslem) -- appka barevně sedí, ne
    // výchozí žluto-zelená paleta pluginu.
    aggregateClusterLayer.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) => L.divIcon({
        html: `<div style="width:36px;height:36px;background:var(--water-deep);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize: [36, 36],
      }),
    }).addTo(map)
    // Vlastní shluková vrstva pro výpravy -- jiná barva (jantarová) než
    // úlovky (tmavě modrá), ať appka na první pohled odliší, co číslo
    // vlastně počítá, když appka ukáže obě vrstvy zapnuté najednou.
    tripsClusterLayer.current = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: (cluster) => L.divIcon({
        html: `<div style="width:32px;height:32px;background:var(--amber-deep);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize: [32, 32],
      }),
    }).addTo(map)
    draftLayer.current = L.layerGroup().addTo(map)

    map.on('click', (e) => handleMapClickRef.current?.(e.latlng))
    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // --- init samostatné mapy pro záložku Mapa, jednou ---
  useEffect(() => {
    if (!mapTabRef.current || mapTabInstance.current) return
    const map = L.map(mapTabRef.current).setView([49.8, 15.5], 8)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Podklad: OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    mapTabMarkersLayer.current = L.layerGroup().addTo(map)
    mapTabAggregateClusterLayer.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) => L.divIcon({
        html: `<div style="width:36px;height:36px;background:var(--water-deep);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize: [36, 36],
      }),
    }).addTo(map)
    mapTabTripsClusterLayer.current = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: (cluster) => L.divIcon({
        html: `<div style="width:32px;height:32px;background:var(--amber-deep);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize: [32, 32],
      }),
    }).addTo(map)
    mapTabInstance.current = map
    return () => { map.remove(); mapTabInstance.current = null }
  }, [])

  function handleMapClick(latlng) {
    const target = placementTargetRef.current
    if (!target) return
    const point = { lat: latlng.lat, lng: latlng.lng }

    if (target === 'session-point') {
      setRodPointsDraft((prev) => {
        const next = [...(prev || []), point]
        // Po prvním prutu appka přiblíží mapu blíž -- další pruty bývají
        // jen pár metrů od sebe, na širším přiblížení by se klikalo špatně.
        if (next.length === 1) mapInstance.current?.setView([point.lat, point.lng], 19)
        return next
      })
      return
    }

    if (target === 'shore-point-click') {
      // Ruční ekvivalent GPS bodu na břehu (u zpětné výpravy, appka totiž
      // GPS nevolá vůbec -- viz startManualShorePointPlacement). Appka
      // odtud pokračuje STEJNÝM krokem "jak se místo jmenuje?" jako GPS
      // cesta -- obě cesty se od tohohle bodu dál chovají identicky.
      setPlacementTarget(null)
      setGpsManualTitle('')
      setGpsManualRevir('')
      setGpsConfirmStep({ point, matches: findNearestHistoryMatches(point) })
      return
    }

    if (target === 'area-point' || target === 'relocate-area-point' || target === 'area-point-append') {
      setAreaDraft((prev) => ({ areas: prev?.areas || [], current: [...(prev?.current || []), point] }))
      return
    }

    if (target === 'river-line-point') {
      if (riverConfirm) return // appka čeká na "Použít"/"Zkusit znovu" -- další klik na mapu teď nic nepřidává
      setRiverLineDraft((prev) => ({ points: [...(prev?.points || []), point] }))
      return
    }

    if (target === 'relocate-session-point') {
      const sid = relocateSessionIdRef.current
      ;(async () => {
        const { error } = await supabase.from('sessions').update({ lat: point.lat, lng: point.lng }).eq('id', sid)
        if (error) { alert(error.message); setPlacementTarget(null); return }
        // U přívlače je "Místo 1" ten samý bod jako tečka výpravy (appka
        // ho tak navrhla schválně -- žádný samostatný bod na břehu navíc).
        // Appka proto při přesunu tečky aktualizuje zároveň i pozici
        // prvního místa, ať mezi nimi nevznikne nesoulad.
        const relocatedSession = sessions.find((s) => s.id === sid)
        const firstRod = relocatedSession?.rods?.[0]
        if (relocatedSession && LURE_TYPES.includes(relocatedSession.type) && firstRod) {
          await supabase.from('rods').update({ lat: point.lat, lng: point.lng }).eq('id', firstRod.id)
        }
        await loadSessions()
        // placementTarget appka vynuluje AŽ TEĎ, ne hned na začátku --
        // jinak by mezi kliknutím a dokončením loadSessions() na okamžik
        // platilo isDrawingNow === false, a appka by mapu mezitím stihla
        // oddálit (mapový efekt se spustí znovu při každé změně sessions).
        // suppressSessionFitRef appka nastaví TĚSNĚ před vynulováním --
        // appka tak nechá mapu tak, jak si ji uživatel sám přiblížil,
        // místo aby appka vycentrovala zpátky na pevný zoom.
        suppressSessionFitRef.current = true
        setPlacementTarget(null)
      })()
      return
    }

    if (target === 'add-rod-to-session') {
      const info = addRodToSessionRef.current
      addRodToSessionRef.current = null
      if (!info) { setPlacementTarget(null); return }
      ;(async () => {
        const label = LURE_TYPES.includes(info.type) ? 'Místo' : 'Prut'
        const existingCount = (sessions.find((s) => s.id === info.sessionId)?.rods || []).length
        const { error } = await supabase.from('rods').insert({
          session_id: info.sessionId, group_id: groupId, name: `${label} ${existingCount + 1}`,
          lat: point.lat, lng: point.lng, baits: [],
        })
        if (error) { alert(error.message); setPlacementTarget(null); return }
        await loadSessions()
        suppressSessionFitRef.current = true
        setPlacementTarget(null)
      })()
      return
    }

    if (target === 'relocate-catch') {
      const cid = relocateCatchIdRef.current
      ;(async () => {
        const { error } = await supabase.from('catches').update({ lat: point.lat, lng: point.lng }).eq('id', cid)
        if (error) alert(error.message)
        await loadSessions()
        setPlacementTarget(null)
      })()
      return
    }

    if (target === 'new-location-point') {
      setPlacementTarget(null)
      setSavingLocationFor({ title: '', revir: '', area: null, lat: point.lat, lng: point.lng })
      return
    }

    if (target === 'catch-point') {
      setPlacementTarget(null)
      const s = activeSessionRef.current
      setDraftCatch({ point, species: '', category: TYPE_CATEGORY[s?.type] || 'dravec', length: '', weight: '', weightEstimated: false, bait: '', rodId: '', time: s?.status === 'in_progress' ? nowHHMM() : '', photoFile: null, baitPhotoFile: null, revir: s?.revir || '' })
      return
    }

    if (target.startsWith('rod-')) {
      const idx = Number(target.split('-')[1])
      setDraftSession((prev) => {
        if (!prev) return prev
        const rods = [...prev.rods]
        rods[idx] = { ...rods[idx], lat: point.lat, lng: point.lng }
        return { ...prev, rods }
      })
      setPlacementTarget(null)
      return
    }

    if (target.startsWith('edit-rod-')) {
      const rodId = target.slice('edit-rod-'.length)
      setPlacementTarget(null)
      supabase.from('rods').update({ lat: point.lat, lng: point.lng }).eq('id', rodId).then(({ error }) => {
        if (error) alert(error.message)
        else loadSessions()
      })
      return
    }

    if (target.startsWith('relocate-lure-place-')) {
      const rodId = target.slice('relocate-lure-place-'.length)
      setPlacementTarget(null)
      supabase.from('rods').update({ lat: point.lat, lng: point.lng }).eq('id', rodId).then(({ error }) => {
        if (error) alert(error.message)
        else loadSessions()
      })
      return
    }
  }

  // Žádné dependency pole -- appka tenhle efekt chce spustit po KAŽDÉM
  // renderu, ať handleMapClickRef vždycky ukazuje na nejčerstvější verzi
  // handleMapClick (se všemi aktuálními sessions/locationsCatalog v jejím
  // uzávěru). Viz komentář u handleMapClickRef výše.
  useEffect(() => {
    handleMapClickRef.current = handleMapClick
  })

  const pendingTypeRef = useRef('kapr')
  const pendingLiveRef = useRef(false)
  const pendingPointModeCatalogRef = useRef(null)

  // --- kreslení preview polygonu(ů) při tvorbě oblasti (ruční i auto podle břehu) ---
  // Sjednoceno do jednoho efektu (jedno clearLayers) -- areaDraft a riverLineDraft
  // se sice v UI nikdy nezobrazují současně, ale generateRiverArea() nastavuje obě
  // najednou (nová oblast + zrušení rozkreslené čáry), takže dva samostatné efekty
  // by si mohly navzájem smazat výsledek podle pořadí spuštění.
  useEffect(() => {
    if (!draftLayer.current) return
    draftLayer.current.clearLayers()

    if (areaDraft) {
      areaDraft.areas.forEach((pts) => {
        L.polygon(pts.map((p) => [p.lat, p.lng]), {
          color: '#6B7A4F', weight: 2, fillColor: '#6B7A4F', fillOpacity: 0.15,
        }).addTo(draftLayer.current)
      })

      const cur = areaDraft.current
      if (cur.length) {
        const latlngs = cur.map((p) => [p.lat, p.lng])
        if (latlngs.length === 1) {
          L.circleMarker(latlngs[0], { radius: 6, color: '#6B7A4F' }).addTo(draftLayer.current)
        } else {
          L.polyline(latlngs, { color: '#6B7A4F', weight: 3, dashArray: '6 6' }).addTo(draftLayer.current)
          latlngs.forEach((ll) => L.circleMarker(ll, { radius: 5, color: '#6B7A4F', fillOpacity: 1 }).addTo(draftLayer.current))
        }
      }
    }

    if (riverLineDraft && riverLineDraft.points.length) {
      const latlngs = riverLineDraft.points.map((p) => [p.lat, p.lng])
      if (latlngs.length === 1) {
        L.circleMarker(latlngs[0], { radius: 6, color: '#2C6E71' }).addTo(draftLayer.current)
      } else {
        L.polyline(latlngs, { color: '#2C6E71', weight: 3, dashArray: '6 6' }).addTo(draftLayer.current)
        latlngs.forEach((ll) => L.circleMarker(ll, { radius: 5, color: '#2C6E71', fillOpacity: 1 }).addTo(draftLayer.current))
      }
    }

    // Výsledek generování podle břehu, čeká na potvrzení "Použít" -- appka
    // ho ukáže vyplněný sytější barvou, ať je na první pohled vidět, co se
    // vlastně bude ukládat, než uživatel klikne "Použít".
    if (riverConfirm) {
      riverConfirm.polygons.forEach((pts) => {
        L.polygon(pts.map((p) => [p.lat, p.lng]), {
          color: '#2D78C8', weight: 2, fillColor: '#2D78C8', fillOpacity: 0.4,
        }).addTo(draftLayer.current)
      })
    }
  }, [areaDraft, riverLineDraft, riverConfirm])

  // --- kreslení náhledu pozic prutů/míst při zakládání bodové výpravy ---
  useEffect(() => {
    if (!draftLayer.current) return
    draftLayer.current.clearLayers()
    if (!rodPointsDraft) return
    // Appka tady dřív kreslila jen pruty/místa, jak je uživatel postupně
    // klikal -- samotný bod "kde stojím" (appka ho zjistí přes GPS nebo
    // ho appka dá kliknout ručně, viz pendingGpsShorePointRef výše) se
    // nikdy nevykresloval, i když je od začátku sběru pozic prutů/míst
    // už appce známý. Uživatel tak neviděl svou pozici vůči tomu, kam
    // kliká pro prut 1/2 -- appka ho teď doplní jako bílou tečku s
    // vlastní barvou obrysu.
    const shorePoint = pendingGpsShorePointRef.current
    if (shorePoint) {
      L.circleMarker([shorePoint.lat, shorePoint.lng], {
        radius: 8, color: userColor(userId), weight: 2, fillColor: '#fff', fillOpacity: 0.9,
      }).bindPopup('Tvoje pozice').addTo(draftLayer.current)
    }
    const label = LURE_TYPES.includes(pendingTypeRef.current) ? 'Místo' : 'Prut'
    rodPointsDraft.forEach((p, i) => {
      const color = rodColors[i % rodColors.length]
      L.circleMarker([p.lat, p.lng], { radius: 8, color, weight: 2, fillColor: color, fillOpacity: 0.6 })
        .bindPopup(`${label} ${i + 1}`).addTo(draftLayer.current)
    })
  }, [rodPointsDraft])

  function sessionForCatch(c) {
    return sessions.find((s) => s.id === c.session_id)
  }

  function normalizeAreas(area) {
    if (!area || area.length === 0) return []
    const raw = (area[0] && typeof area[0].lat === 'number') ? [area] : area
    // obranně: vyřaď cokoli, co není platné pole bodů {lat, lng} — appka tak nikdy nespadne na poškozených datech
    return raw
      .filter((pts) => Array.isArray(pts))
      .map((pts) => pts.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number'))
      .filter((pts) => pts.length >= 3)
  }

  // Stejné jako normalizeAreas, ale pro sessions.area, kde si každý polygon
  // navíc pamatuje location_id katalogového místa, ze kterého vznikl (nebo
  // null, pokud je nakreslený ručně). Zvládne i starší data uložená ve
  // starém "plochém" formátu (pole polí bodů bez location_id) — ta se
  // zobrazí jako "Oblast N" dokud výpravu znovu neaktualizuješ/nepřiřadíš
  // z katalogu, kdy se location_id doplní.
  function normalizeSessionAreas(area) {
    if (!area || area.length === 0) return []
    const raw = (area[0] && typeof area[0].lat === 'number') ? [area] : area
    return raw
      .map((entry) => {
        if (entry && !Array.isArray(entry) && Array.isArray(entry.points)) {
          const points = entry.points.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
          if (points.length < 3) return null
          return { location_id: entry.location_id || null, points }
        }
        if (Array.isArray(entry)) {
          const points = entry.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
          if (points.length < 3) return null
          return { location_id: null, points }
        }
        return null
      })
      .filter(Boolean)
  }

  function areaCentroid(pts) {
    return {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    }
  }

  // Hrubý odhad vzdálenosti v metrech mezi dvěma body {lat,lng} -- používá
  // se JEN na řazení/výpis v seznamu navázání ("nejbližší první"), nemá
  // žádný vliv na to, jak appka navázání samo geometricky zpracuje.
  function roughDistanceMeters(a, b) {
    const dLat = (a.lat - b.lat) * 111320
    const midLat = (a.lat + b.lat) / 2
    const dLng = (a.lng - b.lng) * 111320 * Math.cos((midLat * Math.PI) / 180)
    return Math.sqrt(dLat * dLat + dLng * dLng)
  }

  // Test "je bod uvnitř polygonu?" (ray-casting) -- appka ho použije u
  // katalogových míst s vyšrafovanou plochou (starší revíry). Porovnání
  // vzdálenosti od těžiště plochy by u dlouhého úseku (např. pro loďky)
  // mohlo appce říct "jsi kilometry daleko", i když jsi geograficky uvnitř
  // toho samého revíru -- těžiště dlouhé plochy bývá daleko od jejích
  // krajů. Přesné "uvnitř/venku" tenhle problém obchází úplně.
  function isPointInPolygon(point, ring) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lng, yi = ring[i].lat
      const xj = ring[j].lng, yj = ring[j].lat
      const intersect = ((yi > point.lat) !== (yj > point.lat))
        && (point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  // Najde nejbližší pojmenovaná místa z historie (výpravy i katalog) k
  // danému GPS bodu -- appka nabídne jméno/revír k převzetí, ať se
  // nemusí u známého místa psát pokaždé ručně znovu. Seskupuje podle jména,
  // appka ukáže jen nejbližší výskyt každého odlišného jména (kvůli
  // soutokům/blízkým, ale odlišným místům appka nikdy nerozhoduje sama --
  // jen nabídne na výběr, poslední slovo má vždycky člověk).
  function findNearestHistoryMatches(point, maxDistanceMeters = 800, maxResults = 3) {
    const named = []

    // Velké úseky pro loďky (scope 'reach') appka do nabídky vůbec
    // nezahrnuje -- u takhle velké plochy by test "jsem uvnitř?" skoro
    // vždycky vyhrál (appka bude uvnitř té plochy prakticky pořád), a
    // zbytečně by tak zastínil malé, konkrétní místo, které je pro
    // jednotlivou výpravu užitečnější nabídnout.
    locationsCatalog.forEach((l) => {
      if (!l.area || l.scope === 'reach') return
      const rings = normalizeAreas(l.area)
      const inside = rings.some((ring) => isPointInPolygon(point, ring))
      if (inside) named.push({ title: l.name, revir: l.revir || '', distance: 0 })
    })

    sessions.forEach((s) => {
      if (!s.title || s.lat == null || s.lng == null) return
      named.push({ title: s.title, revir: s.revir || '', lat: s.lat, lng: s.lng })
    })
    locationsCatalog.forEach((l) => {
      if (l.lat == null || l.lng == null || l.scope === 'reach') return
      named.push({ title: l.name, revir: l.revir || '', lat: l.lat, lng: l.lng, id: l.id })
    })
    const withDist = named
      .map((n) => (n.distance === 0 ? n : { ...n, distance: roughDistanceMeters(point, n) }))
      .filter((n) => n.distance <= maxDistanceMeters)
      .sort((a, b) => a.distance - b.distance)
    const seen = new Set()
    const grouped = []
    for (const n of withDist) {
      const key = normalizeSearchText(n.title)
      if (seen.has(key)) continue
      seen.add(key)
      grouped.push(n)
      if (grouped.length >= maxResults) break
    }
    return grouped
  }

  const gpsRequestIdRef = useRef(0) // zneplatní dobíhající odpověď GPS, když uživatel mezitím přešel na ruční umístění

  // --- GPS flow zakládání výpravy: appka zjistí polohu, nabídne nejbližší
  // známá jména, a teprve pak appka spustí OBVYKLÉ klikání pozic prutů do
  // vody (beze změny) -- GPS bod appka použije jako "kotvu" výpravy
  // (draftSession.point) MÍSTO dřívějšího odvození z prvního prutu.
  function startGpsFlow() {
    setLocationPickerStep(null)
    setGpsCapturing(true)
    const requestId = ++gpsRequestIdRef.current
    if (!navigator.geolocation) {
      setGpsCapturing(false)
      startManualShorePointPlacement()
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsRequestIdRef.current !== requestId) return // uživatel mezitím zvolil ruční umístění
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsCapturing(false)
        mapInstance.current?.setView([point.lat, point.lng], 16)
        setGpsManualTitle('')
        setGpsManualRevir('')
        setGpsConfirmStep({ point, matches: findNearestHistoryMatches(point) })
      },
      () => {
        if (gpsRequestIdRef.current !== requestId) return
        // GPS selhalo/zamítnuto -- appka rovnou nabídne ruční umístění bodu
        // na mapě, ať uživatel nezůstane bez cesty dál.
        setGpsCapturing(false)
        startManualShorePointPlacement()
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // Ruční záložní cesta -- appka na ni přejde sama při selhání GPS, nebo
  // na ni uživatel může přejít i dobrovolně (tlačítko v "Zjišťuji polohu…"),
  // NEBO appka na ni jde rovnou u zpětné výpravy (žádné GPS -- appka není
  // fyzicky na místě). Appka nechá kliknout JEDEN bod na břehu (stejná role
  // jako GPS bod u živé výpravy), a teprve pak appka pokračuje stejným
  // krokem "jak se místo jmenuje?" jako GPS cesta -- obě cesty se odtud
  // dál shodují, jen se liší v tom, JAK appka ten první bod získala.
  function startManualShorePointPlacement() {
    gpsRequestIdRef.current++ // zneplatní případnou dobíhající GPS odpověď
    setGpsCapturing(false)
    setGpsConfirmStep(null)
    setPlacementTarget('shore-point-click')
  }

  function pickGpsMatch(match) {
    const point = gpsConfirmStep.point
    setGpsConfirmStep(null)
    if (LURE_TYPES.includes(pendingTypeRef.current)) {
      // Přívlač: appka nemá žádná "další místa" navíc -- jeden bod appka
      // rovnou dokončí, bez čekání na další klik.
      finalizeNewSession([point], point, { title: match.title, revir: match.revir })
      return
    }
    pendingGpsShorePointRef.current = point
    pendingPointModeCatalogRef.current = { title: match.title, revir: match.revir, locationIds: match.id ? [match.id] : [] }
    setRodPointsDraft([])
    setPlacementTarget('session-point')
  }

  function confirmGpsManual() {
    if (!gpsManualTitle.trim()) return
    const point = gpsConfirmStep.point
    setGpsConfirmStep(null)
    if (LURE_TYPES.includes(pendingTypeRef.current)) {
      finalizeNewSession([point], point, { title: gpsManualTitle.trim(), revir: gpsManualRevir.trim() })
      return
    }
    pendingGpsShorePointRef.current = point
    pendingPointModeCatalogRef.current = { title: gpsManualTitle.trim(), revir: gpsManualRevir.trim(), locationIds: [] }
    setRodPointsDraft([])
    setPlacementTarget('session-point')
  }

  function cancelGpsFlow() {
    setGpsConfirmStep(null)
    pendingGpsShorePointRef.current = null
    setRodPointsDraft(null)
    setPlacementTarget(null)
  }

  function focusOnPoint(lat, lng) {
    if (!mapInstance.current || lat == null || lng == null) return
    setMobileSheetOpen(false)
    mapInstance.current.setView([lat, lng], 16)
  }

  function focusOnArea(pts) {
    if (!mapInstance.current || !pts.length) return
    setMobileSheetOpen(false)
    const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng]))
    mapInstance.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
  }


  // Přiblíží dominantní mapu na katalogové místo, ALE zůstává v režimu
  // "📍 Revíry" (na rozdíl od otevření konkrétní výpravy, které režim opouští).
  function focusOnLocation(location) {
    if (!mapInstance.current) return
    setShowLocations(false)
    setLocationsReturnId(null)
    setMobileSheetOpen(false)
    if (location.area) {
      const areas = normalizeAreas(location.area)
      const bounds = areas.flat().map((p) => [p.lat, p.lng])
      if (bounds.length) mapInstance.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
    } else if (location.lat != null && location.lng != null) {
      mapInstance.current.setView([location.lat, location.lng], 16)
    }
  }

  // --- render markerů: agregovaný pohled (podle filtrů, přes všechny výpravy) nebo detail jedné výpravy ---
  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current) return
    // Appka mapu na Výpravách/Úlovcích schovává přes CSS (display:none) a
    // vrací ji zpátky, kdykoli je potřeba na ni kliknout. Leaflet si o
    // sobě sám novou velikost nezjistí -- invalidateSize() je nutné volat
    // pokaždé, jinak by se mapa po odkrytí vykreslila jen zčásti.
    mapInstance.current.invalidateSize()
    markersLayer.current.clearLayers()
    if (aggregateClusterLayer.current) aggregateClusterLayer.current.clearLayers()
    if (tripsClusterLayer.current) tripsClusterLayer.current.clearLayers()
    const map = mapInstance.current

    // Appka mapu NEPŘEOSTŘUJE ("fitBounds"/"setView"), když uživatel zrovna
    // něco kreslí/umísťuje (čeká se na jeho klik) -- jinak by appka při
    // KAŽDÉ změně placementTarget (a ten je v dependency poli níže) zase
    // oddálila/posunula mapu na "co se teď vejde", a smazala tak uživateli
    // jeho vlastní přiblížení. Sdílí ho 'locations' větev i souhrnný
    // agregovaný pohled na konci efektu.
    const isDrawingNow = !!(
      placementTarget || areaDraft || riverLineDraft || rodPointsDraft ||
      riverConfirm || areaDrawChoice || editingAreasLocation || editingAreasSession || savingLocationFor ||
      gpsConfirmStep || gpsCapturing
    )

    // Zakládání úplně nové výpravy (od typové nabídky až po otevřený
    // formulář): appka schválně nekreslí ŽÁDNÉ staré výpravy ani úlovky
    // (čistá mapa, ať appka nepůsobí zmateně) a mapu ani nepřesouvá --
    // zůstane tam, kde uživatel mapu naposled nechal. Vrstvy appka nechá
    // vyčištěné (viz clearLayers výše), dál se v tomhle renderu nic
    // nekreslí ani nepřeostřuje.
    const isCreatingNewSession = pickingType || !!locationPickerStep || !!rodPointsDraft || !!draftSession ||
      placementTarget === 'session-point' || placementTarget === 'shore-point-click'

    // Appka dřív při umísťování/přesouvání konkrétního prutu (tlačítko
    // "pozice na mapě" u už rozpracované draftSession) nekreslila na
    // mapu nic -- uživatel neviděl svůj GPS bod ani ostatní už umístěné
    // pruty, dokud výpravu neuložil, což ztěžovalo odhad, kam nahodit
    // další prut. Appka teď v týhle jedné situaci (draftSession existuje
    // a appka čeká na klik pro konkrétní prut) markery nakreslí.
    const armedForRodOfDraft = !!draftSession && placementTarget &&
      /^(rod|edit-rod)-\d+$/.test(placementTarget)
    if (armedForRodOfDraft && draftSession.point) {
      L.circleMarker([draftSession.point.lat, draftSession.point.lng], {
        radius: 8, color: userColor(userId), weight: 2, fillColor: '#fff', fillOpacity: 0.9,
      }).bindPopup('Tvoje pozice').addTo(markersLayer.current)
      ;(draftSession.rods || []).forEach((r, i) => {
        const color = rodColors[i % rodColors.length]
        L.circleMarker([r.lat, r.lng], {
          radius: 8, color, weight: 2, fillColor: color, fillOpacity: 0.5,
        }).bindPopup(r.name || `Prut ${i + 1}`).addTo(markersLayer.current)
      })
    }

    if (isCreatingNewSession) return

    // Záložka Mapa má vlastní, samostatný useEffect (přepínatelné vrstvy
    // moje/party výpravy, moje/party úlovky, revíry) -- tenhle starší,
    // velký efekt jen vyčistil vrstvy výše a dál pro 'map' nic nedělá.
    if (activePanel === 'map') return

    // Appka mapu úplně vynechá, pokud je zrovna schovaná přes CSS
    // (Domů/Úlovky/Nástrahy/Měrné stanice, nebo Výpravy jen v klidu bez
    // rozpracovaného umísťování/kreslení) -- stejnou podmínku appka
    // používá o kus níž u invalidateSize(). Bez tohoto by appka
    // zbytečně přepočítávala značku pro KAŽDÝ úlovek v CELÉ historii
    // appky (souhrnný pohled níž) při každém přepnutí záložky, i když tu
    // mapu nikdo neviděl -- hlavní příčina znatelného
    // zpomalení při přechodu na Úlovky, s velikostí fotek to
    // nesouvisí.
    const mapHiddenNow = activePanel === 'home' || activePanel === 'stations' ||
      activePanel === 'records' || activePanel === 'stats' || activePanel === 'help' || activePanel === 'settings' ||
      ((activePanel === 'catches' || activePanel === 'baits' || activePanel === null) && !mapNeededForInteraction)
    if (mapHiddenNow) return

    if (activePanel === 'locations') {
      const bounds = []
      // Velké úseky (scope 'reach', chytání z lodi) appka na tuhle souhrnnou
      // mapu záměrně nekreslí -- na dlouhé trase by přes sebe navzájem
      // překrývaly malá místa. Vidět je jen v seznamu a po kliknutí
      // "Zobrazit na hlavní mapě" (focusOnLocation) přiblížené samostatně.
      locationsCatalog.filter((loc) => loc.scope !== 'reach').forEach((loc) => {
        if (loc.area) {
          const areas = normalizeAreas(loc.area)
          areas.forEach((pts) => {
            const polygon = L.polygon(pts.map((p) => [p.lat, p.lng]), {
              color: '#6B7A4F', weight: 2, fillColor: '#6B7A4F', fillOpacity: 0.18,
            }).bindPopup(`${loc.name}${loc.revir ? ` (${loc.revir})` : ''}`)
            // Pokud appka zrovna něco kreslí (nová/upravovaná oblast, čára podle
            // břehu...), klik na starou plochu revíru se nemá otevřít jako detail
            // -- má se chovat jako běžný klik do mapy (přidat bod), jinak nejde
            // překreslit/navázat přesně na stávající místo.
            polygon.on('click', (e) => {
              if (isPlacingSomething) { handleMapClick(e.latlng); return }
              setLocationsReturnId(loc.id); setBaitsInitialKey(null); setShowLocations(true)
            })
            polygon.addTo(markersLayer.current)
            pts.forEach((p) => bounds.push([p.lat, p.lng]))
          })
          // pevně velký puntík uprostřed -- vyšrafovaná plocha se zmenšováním mapy
          // fyzicky zmenšuje (na rozdíl od úlovků), při oddálení bývá skoro neviditelná
          const c = areaCentroid(areas.flat())
          const centroidMarker = L.circleMarker([c.lat, c.lng], {
            radius: 7, color: '#6B7A4F', weight: 2, fillColor: '#EDE9DC', fillOpacity: 1,
          }).bindPopup(`${loc.name}${loc.revir ? ` (${loc.revir})` : ''}`)
          centroidMarker.on('click', (e) => {
            if (isPlacingSomething) { handleMapClick(e.latlng); return }
            setLocationsReturnId(loc.id); setBaitsInitialKey(null); setShowLocations(true)
          })
          centroidMarker.addTo(markersLayer.current)
        } else if (loc.lat != null && loc.lng != null) {
          const marker = L.circleMarker([loc.lat, loc.lng], {
            radius: 8, color: '#B97F35', weight: 2, fillColor: '#D9A054', fillOpacity: 0.8,
          }).bindPopup(`${loc.name}${loc.revir ? ` (${loc.revir})` : ''}`)
          marker.on('click', (e) => {
            if (isPlacingSomething) { handleMapClick(e.latlng); return }
            setLocationsReturnId(loc.id); setBaitsInitialKey(null); setShowLocations(true)
          })
          marker.addTo(markersLayer.current)
          bounds.push([loc.lat, loc.lng])
        }
      })
      // Pohled mapy appka přeostří na všechny revíry JEN když uživatel
      // zrovna nic nekreslí ani needituje konkrétní místo -- jinak (třeba
      // po kliknutí "Použít" u vygenerované plochy, kdy se areaDraft i
      // placementTarget zase vynulují) by appka i uprostřed úpravy jednoho
      // revíru zase oddálila mapu na celý katalog. suppressLocationsFitRef
      // navíc pokryje přesně TEN okamžik "právě jsem potvrdil/uložil" --
      // isDrawingNow už je v tu chvíli false (editace se zavřela), ale
      // appka má zůstat přiblížená tam, kde uživatel pracoval, ne skočit
      // zpátky na přehled hned při prvním renderu po uzavření editace.
      if (!isDrawingNow) {
        if (suppressLocationsFitRef.current) {
          // Spotřebuje se přesně tady -- na renderu, kde by appka jinak
          // fitBounds fakt spustila. Pokud by se konzumovalo dřív (třeba
          // hned na renderu, kde je isDrawingNow ještě true), pojistka by
          // "vyprchala" moc brzy a pozdější reálné oddálení by neblokovala.
          suppressLocationsFitRef.current = false
        } else if (bounds.length) {
          // animate:false ze stejného důvodu jako u Výprav o kus výše --
          // appka nechce nechat zpožděný "moveend" uniknout do pozdější
          // návštěvy Mapy.
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false })
        } else {
          map.setView([49.8, 15.5], 8, { animate: false })
        }
      }
      return
    }

    if (viewMode === 'detail' && activeSession) {
      // Appka mapu nepřeostří, dokud uživatel čeká na klik (přidávání
      // prutu, přesun úlovku...) -- stejný důvod jako u agregovaného
      // pohledu výše, jinak by appka smazala uživateli jeho přiblížení
      // pokaždé, když appka jen začne čekat na další klik. Appka tohle
      // přeostření navíc dělá jen na panelu Výpravy (activePanel === null)
      // -- viewMode i activeSession totiž zůstávají nastavené i po
      // přepnutí na jinou záložku, takže by appka jinak zbytečně
      // přesouvala tuhle (skrytou) sdílenou mapu i tam, kde na tom
      // nezáleží.
      if (!isDrawingNow && activePanel === null) {
        if (suppressSessionFitRef.current) {
          // Spotřebuje se přesně tady -- appka právě dokončila přesun bodu
          // nebo přidání dalšího místa, uživatel si mapu sám přiblížil na
          // to, co potřeboval vidět. Appka mapu NEPŘEKRESLÍ zpátky na
          // pevný zoom 14 -- to by na bližším přiblížení vypadalo jako
          // nechtěné oddálení, i když appka technicky "jen" centruje.
          suppressSessionFitRef.current = false
        } else if (pendingMapFocusRef.current && pendingMapFocusRef.current.sessionId === activeSession.id) {
          const f = pendingMapFocusRef.current
          map.setView([f.lat, f.lng], f.zoom || 16, { animate: false })
          pendingMapFocusRef.current = null
        } else {
          map.setView([activeSession.lat, activeSession.lng], 14, { animate: false })
        }
      }

      // Appka v běžném prohlížení VŽDY ukáže jen tečku (kde uživatel stál)
      // -- i u starých výprav se skutečně uloženou plochou appka ji TADY
      // NEKRESLÍ (jen při aktivní editaci "Upravit oblasti" -- to je jiná,
      // záměrná cesta, tam appka plochu ukáže, protože ji potřebuješ vidět,
      // abys ji mohl upravit). Appka tak drží konzistentní zobrazení napříč
      // starými i novými výpravami, aniž by stará data jakkoli mazala nebo
      // měnila -- jen je přestává vizuálně kreslit při běžném prohlížení.
      // Barva appka bere vlastní barvu uživatele (stejná jako na Mapě),
      // ne napevno danou barvu -- jinak by appka ukazovala jinou barvu na
      // souhrnné mapě a jinou v detailu téže výpravy.
      const isLureSession = MAP_LURE_LOOK_TYPES.includes(activeSession.type)
      L.circleMarker([activeSession.lat, activeSession.lng], {
        radius: 8, color: userColor(activeSession.user_id), weight: 2, fillColor: '#fff', fillOpacity: 0.9,
      }).bindPopup(`<b>${activeSession.title}</b>`).addTo(markersLayer.current)

      if (!AREA_TYPES.includes(activeSession.type)) {
        (activeSession.rods || []).forEach((r, i) => {
          // U přívlače je PRVNÍ místo tím samým bodem jako tečka výpravy
          // výše (appka ho tak navrhla schválně -- první GPS/klik bod se
          // stává rovnou "Místem 1", appka se neptá na klik znovu). Kreslit
          // ho by appka duplikovala stejný bod dvakrát přes sebe -- appka
          // proto u přívlače první místo přeskočí. Další místa (appka je
          // ukazuje v sekci "Další místa") appka nakreslí VLASTNÍ BARVOU
          // uživatele -- stejnou jako hlavní bod, ne barvou prutů (appka
          // je totiž koncepčně "další stejný bod", ne odlišný prut).
          if (isLureSession && i === 0) return
          const rodColor = isLureSession ? userColor(activeSession.user_id) : rodColors[i % rodColors.length]
          L.circleMarker([r.lat ?? activeSession.lat, r.lng ?? activeSession.lng], {
            radius: 8,
            color: isLureSession ? rodColor : '#fff',
            weight: 2,
            fillColor: isLureSession ? '#fff' : rodColor,
            fillOpacity: isLureSession ? 0.9 : 1,
          }).bindPopup(isLureSession ? 'Další místo' : `<b>${r.name}</b>`).addTo(markersLayer.current)
        })
      }

      filteredCatches(activeSession).forEach((c) => {
        const fillColor = CATEGORY_COLOR[c.category]
        const ringColor = userColor(activeSession.user_id)
        const html = `<div style="width:32px;height:32px;background:${fillColor};border-radius:50%;display:flex;align-items:center;justify-content:center;border:5px solid ${ringColor};box-shadow:0 2px 6px rgba(0,0,0,.35)">${fishSVG('#fff')}</div>`
        const icon = L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })
        const marker = L.marker([c.lat ?? activeSession.lat, c.lng ?? activeSession.lng], { icon })
        marker.on('click', () => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) })
        marker.addTo(markersLayer.current)
      })
      return
    }

    // --- agregovaný pohled ---
    const matches = []
    sessions.forEach((s) => {
      if (activeUserFilter !== 'all' && s.user_id !== activeUserFilter) return
      ;(s.catches || []).forEach((c) => {
        if (activeCategory !== 'all' && c.category !== activeCategory) return
        matches.push({ c, s })
      })
    })

    matches.forEach(({ c, s }) => {
      const fillColor = CATEGORY_COLOR[c.category]
      const ringColor = userColor(s.user_id)
      const html = `<div style="width:28px;height:28px;background:${fillColor};border-radius:50%;display:flex;align-items:center;justify-content:center;border:5px solid ${ringColor};box-shadow:0 2px 6px rgba(0,0,0,.35)">${fishSVG('#fff')}</div>`
      const icon = L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 14] })
      const marker = L.marker([c.lat ?? s.lat, c.lng ?? s.lng], { icon })
      marker.on('click', () => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) })
      marker.addTo(aggregateClusterLayer.current)
    })

    // Tahle sdílená mapa je v tomhle stavu (Domů/Úlovky/Nástrahy/Výpravy
    // v klidu) vždycky schovaná -- appka ji tu dřív přesto přeostřovala na
    // úlovky podle filtru Výprav, což potichu kazilo pozici pro záložku
    // Mapa i pro placement flows, když se appka objevila zpátky. Appka
    // tady teď nechává mapu tak, jak je -- jen dokreslí značky výše.
  }, [activeSession, activeCategory, activeUserFilter, viewMode, sessions, locationsCatalog, activePanel, placementTarget, areaDraft, riverLineDraft, rodPointsDraft, riverConfirm, areaDrawChoice, editingAreasLocation, editingAreasSession, savingLocationFor, pickingType, locationPickerStep, draftSession])

  // --- záložka 🗺 Mapa: přepínatelné vrstvy (moje/party výpravy, moje/party
  // úlovky, revíry), samostatně od agregovaného pohledu výše. Úlovky i
  // výpravy appka shlukuje (dvě oddělené vrstvy pluginu leaflet.markercluster,
  // jinak barevné, ať jde na první pohled poznat, co číslo počítá) -- revíry
  // ne (jejich počet bývá výrazně menší, shlukování by tam spíš překáželo).
  useEffect(() => {
    if (activePanel !== 'map' || !mapTabInstance.current || !mapTabMarkersLayer.current || !mapTabAggregateClusterLayer.current || !mapTabTripsClusterLayer.current) return
    const map = mapTabInstance.current
    // Mapa mohla být donedávna schovaná (jiný panel ji schovává přes CSS) --
    // Leaflet si o sobě nezjistí novou velikost sám, jen na požádání. Bez
    // tohohle by fitBounds/setView níže počítaly se starou (často nulovou)
    // velikostí a appka by skončila přiblížená na nesmyslném místě.
    map.invalidateSize()
    mapTabMarkersLayer.current.clearLayers()
    mapTabAggregateClusterLayer.current.clearLayers()
    mapTabTripsClusterLayer.current.clearLayers()

    // ---------- fokusovaný režim: appka ukáže jen JEDNU vybranou výpravu ----------
    // Appka sem přijde přes tlačítko "Zobrazit na mapě" v detailu výpravy.
    // Appka schválně nepoužívá shlukovací vrstvy (nejsou potřeba pro pár
    // bodů jedné výpravy) a appka ignoruje Kdo/Co vrstvy úplně -- appka tu
    // ukáže přesně tohle a nic jiného, ať appka nemusí řešit, jak najít
    // jednu výpravu v hromadě cizích. U přívlače appka nakreslí VŠECHNY
    // body výpravy (ne jen ten první), přesně proto appka tenhle režim
    // udělala -- zoomToShowLayer na shluknuté mapě tohle neumí.
    if (mapFocusSessionId) {
      const s = sessions.find((x) => x.id === mapFocusSessionId)
      if (!s) return
      const bounds = []
      const color = userColor(s.user_id)
      const makePointIcon = (num) => L.divIcon({
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:10px;color:${color}">${num ?? ''}</div>`,
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      })
      if (MAP_LURE_LOOK_TYPES.includes(s.type)) {
        if (s.lat != null && s.lng != null) {
          L.marker([s.lat, s.lng], { icon: makePointIcon(1) }).bindPopup(`${s.title} (Místo 1)`).addTo(mapTabMarkersLayer.current)
          bounds.push([s.lat, s.lng])
        }
        ;(s.rods || []).slice(1).forEach((r, i) => {
          if (r.lat == null || r.lng == null) return
          L.marker([r.lat, r.lng], { icon: makePointIcon(i + 2) }).bindPopup(`${s.title} (Místo ${i + 2})`).addTo(mapTabMarkersLayer.current)
          bounds.push([r.lat, r.lng])
        })
      } else {
        // Bodové typy appka navíc ukáže bod "kde stojíš" (appka ho
        // nastavuje přes GPS/ruční klik, je to jiná souřadnice než pruty).
        if (s.lat != null && s.lng != null) {
          L.marker([s.lat, s.lng], { icon: makePointIcon() }).bindPopup(s.title).addTo(mapTabMarkersLayer.current)
          bounds.push([s.lat, s.lng])
        }
        // appka u bodových typů (kapr/muška/plavaná): jediný prut appka
        // ukáže v barvě uživatele (stejná identita jako u přívlače), dva a
        // víc prutů appka odliší barvami prutů (rodColors), ať appka pozná
        // Prut 1 od Prutu 2 i tady na mapě.
        const rods = (s.rods || []).filter((r) => r.lat != null && r.lng != null)
        rods.forEach((r, i) => {
          const rodColor = rods.length === 1 ? color : rodColors[i % rodColors.length]
          const rodIcon = L.divIcon({
            html: `<div style="width:18px;height:18px;border-radius:50%;background:${rodColor};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>`,
            className: '', iconSize: [18, 18], iconAnchor: [9, 9],
          })
          L.marker([r.lat, r.lng], { icon: rodIcon }).bindPopup(r.name || `Prut ${i + 1}`).addTo(mapTabMarkersLayer.current)
          bounds.push([r.lat, r.lng])
        })
      }
      ;(s.catches || []).forEach((c) => {
        if (c.lat == null && s.lat == null) return
        const fillColor = CATEGORY_COLOR[c.category]
        const html = `<div style="width:26px;height:26px;background:${fillColor};border-radius:50%;display:flex;align-items:center;justify-content:center;border:4px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,.35)">${fishSVG('#fff')}</div>`
        const icon = L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] })
        L.marker([c.lat ?? s.lat, c.lng ?? s.lng], { icon })
          .on('click', () => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) })
          .addTo(mapTabMarkersLayer.current)
        bounds.push([c.lat ?? s.lat, c.lng ?? s.lng])
      })
      // Fokus appka přepočítá vždycky znovu -- na rozdíl od agregovaného
      // pohledu appka nemusí nic "pamatovat", je to samostatná mapa, o
      // kterou se nic jiného nestará.
      if (mapFocusPoint) map.setView([mapFocusPoint.lat, mapFocusPoint.lng], mapFocusPoint.zoom || 17)
      else if (bounds.length === 1) map.setView(bounds[0], 16)
      else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], maxZoom: 16 })
      mapTabHasFitRef.current = true
      mapForceResetRef.current = false
      return
    }

    // ---------- agregovaný pohled (Kdo/Co vrstvy) ----------
    const bounds = []

    if (mapLayers.myTrips || mapLayers.partyTrips) {
      sessions.forEach((s) => {
        const isMine = s.user_id === userId
        if (isMine && !mapLayers.myTrips) return
        if (!isMine && !mapLayers.partyTrips) return
        if (s.lat == null || s.lng == null) return
        const color = userColor(s.user_id)
        // L.marker + vlastní divIcon, ne L.circleMarker -- stejný vzor jako
        // úlovky výše. Plugin leaflet.markercluster je stavěný na L.Marker,
        // s L.CircleMarker nemusí spolehlivě fungovat.
        const html = `<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`
        const icon = L.divIcon({ html, className: '', iconSize: [18, 18], iconAnchor: [9, 9] })
        L.marker([s.lat, s.lng], { icon })
          .bindPopup(`${s.title} — ${userName(s.user_id)}`)
          .on('click', () => { setActivePanel(null); setActiveId(s.id); setViewMode('detail') })
          .addTo(mapTabTripsClusterLayer.current)
        bounds.push([s.lat, s.lng])

        // U přívlače appka může mít i DALŠÍ místa (jez z obou stran řeky
        // apod.) -- appka je na týhle souhrnné mapě nakreslí stejně jako
        // hlavní bod (tečka výpravy), ať appka na Mapě neschovává
        // celou výpravu jen za JEDEN bod, kde jich reálně bylo víc.
        if (MAP_LURE_LOOK_TYPES.includes(s.type)) {
          ;(s.rods || []).slice(1).forEach((r) => {
            if (r.lat == null || r.lng == null) return
            L.marker([r.lat, r.lng], { icon })
              .bindPopup(`${s.title} — ${userName(s.user_id)} (další místo)`)
              .on('click', () => { setActivePanel(null); setActiveId(s.id); setViewMode('detail') })
              .addTo(mapTabTripsClusterLayer.current)
            bounds.push([r.lat, r.lng])
          })
        }
      })
    }

    if (mapLayers.myCatches || mapLayers.partyCatches) {
      sessions.forEach((s) => {
        const isMine = s.user_id === userId
        if (isMine && !mapLayers.myCatches) return
        if (!isMine && !mapLayers.partyCatches) return
        ;(s.catches || []).forEach((c) => {
          const fillColor = CATEGORY_COLOR[c.category]
          const ringColor = userColor(s.user_id)
          const html = `<div style="width:28px;height:28px;background:${fillColor};border-radius:50%;display:flex;align-items:center;justify-content:center;border:5px solid ${ringColor};box-shadow:0 2px 6px rgba(0,0,0,.35)">${fishSVG('#fff')}</div>`
          const icon = L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 14] })
          L.marker([c.lat ?? s.lat, c.lng ?? s.lng], { icon })
            .on('click', () => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) })
            .addTo(mapTabAggregateClusterLayer.current)
          bounds.push([c.lat ?? s.lat, c.lng ?? s.lng])
        })
      })
    }

    // Tohle je teď samostatná mapa -- nikdo jiný s ní nehýbe, appka proto
    // pozici počítá jen jednou (nebo na výslovný reset), a jinak ji nechá
    // úplně na pokoji.
    if (mapForceResetRef.current) {
      // Výslovný požadavek (druhý klik na Mapa).
      if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 })
      else map.setView([49.8, 15.5], 8)
      mapTabHasFitRef.current = true
    } else if (!mapTabHasFitRef.current) {
      // Appka spočítá výchozí přiblížení jen při úplně první návštěvě
      // záložky Mapa v týhle appce -- při každé další appka mapu nechá
      // tak, jak ji uživatel sám nastavil, ať už jde jen o změnu filtru,
      // nebo o návrat z jiné záložky. Prázdné souřadnice appka NEBERE
      // jako "hotovo" -- data se totiž mohla ještě jen nestihnout načíst
      // ze serveru, appka se tak o výchozí přiblížení pokusí znovu, až
      // nějaká data dorazí.
      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 })
        mapTabHasFitRef.current = true
      } else {
        map.setView([49.8, 15.5], 8)
      }
    }
    mapForceResetRef.current = false

    let cancelled = false
    const rafId = requestAnimationFrame(() => {
      if (cancelled || !mapTabInstance.current) return
      mapTabInstance.current.invalidateSize()
    })
    return () => { cancelled = true; cancelAnimationFrame(rafId) }
  }, [activePanel, mapLayers, sessions, locationsCatalog, userId, members, mapFocusSessionId, mapFocusPoint, mapResetNonce])

  async function backfillBaitPhoto(baitName, photoUrl, photoThumbUrl) {
    const key = (baitName || '').trim().toLowerCase()
    if (!key || !photoUrl) return { updated: 0, blocked: 0 }
    let updated = 0, blocked = 0
    for (const s of sessions) {
      for (const r of (s.rods || [])) {
        const baits = r.baits || []
        let changed = false
        const newBaits = baits.map((b) => {
          if (b.name && b.name.trim().toLowerCase() === key && !b.photo_url) {
            changed = true
            return { ...b, photo_url: photoUrl, photo_thumb_url: photoThumbUrl || photoUrl }
          }
          return b
        })
        if (changed) {
          const { data, error } = await supabase.from('rods').update({ baits: newBaits }).eq('id', r.id).select()
          if (!error && data && data.length > 0) updated++
          else blocked++
        }
      }
      for (const c of (s.catches || [])) {
        if (c.bait && c.bait.trim().toLowerCase() === key && !c.bait_photo_url) {
          const { data, error } = await supabase.from('catches').update({ bait_photo_url: photoUrl, bait_photo_thumb_url: photoThumbUrl || photoUrl }).eq('id', c.id).select()
          if (!error && data && data.length > 0) updated++
          else blocked++
        }
      }
    }
    await loadSessions()
    return { updated, blocked }
  }

  async function renameBaitEverywhere(oldName, newName) {
    const oldKey = (oldName || '').trim().toLowerCase()
    const newKey = (newName || '').trim().toLowerCase()
    if (!oldKey || !newName || oldKey === newKey) return
    for (const s of sessions) {
      for (const r of (s.rods || [])) {
        const baits = r.baits || []
        let changed = false
        const newBaits = baits.map((b) => {
          if (b.name && b.name.trim().toLowerCase() === oldKey) {
            changed = true
            return { ...b, name: newName }
          }
          return b
        })
        if (changed) {
          const legacyBait = newBaits.map((b) => b.name).filter(Boolean).join(', ') || null
          await supabase.from('rods').update({ baits: newBaits, bait: legacyBait }).eq('id', r.id)
        }
      }
      for (const c of (s.catches || [])) {
        if (c.bait && c.bait.trim().toLowerCase() === oldKey) {
          await supabase.from('catches').update({ bait: newName }).eq('id', c.id)
        }
      }
    }
    await loadSessions()
  }

  async function removeBaitFromMyRods(name) {
    const key = (name || '').trim().toLowerCase()
    if (!key) return
    for (const s of sessions) {
      for (const r of (s.rods || [])) {
        const baits = r.baits || []
        if (!baits.some((b) => b.name && b.name.trim().toLowerCase() === key)) continue
        const newBaits = baits.filter((b) => !(b.name && b.name.trim().toLowerCase() === key))
        const legacyBait = newBaits.map((b) => b.name).filter(Boolean).join(', ') || null
        await supabase.from('rods').update({ baits: newBaits, bait: legacyBait }).eq('id', r.id)
      }
    }
    await loadSessions()
  }

  function startSaveLocation(source) {
    // source může být draftSession (má .point) nebo uložená výprava (má .lat/.lng přímo)
    // sessions.area má u polygonů navíc location_id — katalogové místo to nepotřebuje, bereme jen body
    const area = source.area ? normalizeSessionAreas(source.area).map((entry) => entry.points) : null
    const lat = source.point ? source.point.lat : source.lat
    const lng = source.point ? source.point.lng : source.lng
    setSavingLocationFor({ title: source.title || '', revir: source.revir || '', area, lat, lng })
  }

  function startAddLocationArea() {
    setShowLocations(false)
    startAddAreaPoint((newAreas) => {
      const c = areaCentroid(newAreas.flat())
      setSavingLocationFor({ title: '', revir: '', area: newAreas, lat: c.lat, lng: c.lng })
    })
  }

  function startAddLocationPoint() {
    setShowLocations(false)
    setPlacementTarget('new-location-point')
  }

  // Resetuje paměť "navázat na předchozí úsek" -- volá se při skutečném
  // uzavření editace místa (uložení i zrušení), ať appka příště omylem
  // nenabídne navázání na kontext z úplně jiného, nesouvisejícího revíru.
  function resetRiverSnapMemory() {
    lastRiverCutRef.current = null
    sessionFirstStartCutRef.current = null
    setRiverSnapAvailable(false)
    setSnapSourceLabel(null)
    setShowCatalogSnapPicker(false)
  }

  // Vybere řez z JINÉHO, dřív uloženého revíru (locations.edge_cuts) jako
  // zdroj navázání pro nově kreslenou plochu -- na rozdíl od lastRiverCutRef
  // naplněného automaticky po vygenerování v týhle samé editaci, tohle
  // funguje i napříč zcela samostatnými, dávno uloženými revíry.
  function pickCatalogSnap(location, which) {
    const cut = location.edge_cuts?.[which]
    if (!cut) return
    lastRiverCutRef.current = cut
    setRiverSnapAvailable(true)
    setRiverSnapEnabled(true)
    setSnapSourceLabel(`${location.name} (${which === 'start' ? 'začátek' : 'konec'})`)
    setShowCatalogSnapPicker(false)
  }

  async function saveLocationToCatalog(name, revir, scope = 'spot') {
    const s = savingLocationFor
    const edgeCuts = (sessionFirstStartCutRef.current || lastRiverCutRef.current)
      ? { start: sessionFirstStartCutRef.current || null, end: lastRiverCutRef.current || null }
      : null
    const { error } = await supabase.from('locations').insert({
      group_id: groupId, created_by: userId, name, revir: revir || null,
      area: s.area, lat: s.lat, lng: s.lng, scope, edge_cuts: edgeCuts,
    })
    if (error) { alert(error.message); return }
    setSavingLocationFor(null)
    resetRiverSnapMemory()
    await loadLocationsCatalog()
  }

  async function updateLocationsCatalogEntry(id, fields) {
    const { error } = await supabase.from('locations').update(fields).eq('id', id)
    if (error) { alert(error.message); return }
    await loadLocationsCatalog()
  }

  // Ruční oprava stanice ČHМÚ ve výpravě appka dřív pamatovala jen pro
  // tenhle jeden výpočet -- příště appka u stejného bodu zase spustila
  // automatický výběr od nuly. Tahle funkce opravu uloží do katalogu
  // míst (stejný mechanismus jako LocationsModal), aby appka příště
  // stanici nabídla už opravenou:
  // 1) existuje-li JEDNO navázané místo, appka opraví jen to.
  // 2) jinak appka zkusí najít blízký (do 150 m) záznam v katalogu.
  // 3) jinak appka vytvoří nový, minimální bodový záznam.
  // Appka vrátí id toho místa, ať appka aktuální výpravu/úlovek může
  // hned propojit -- díky tomu se oprava projeví i příště.
  async function persistStationChoice(point, label, revir, linkedLocationIds, station) {
    if (linkedLocationIds && linkedLocationIds.length === 1) {
      await updateLocationsCatalogEntry(linkedLocationIds[0], {
        hydro_station_id: station.objID, hydro_station_name: station.name, hydro_stream_name: station.stream,
      })
      return linkedLocationIds[0]
    }
    const nearby = locationsCatalog.find((l) =>
      l.lat != null && l.lng != null && l.scope !== 'reach' && roughDistanceMeters(point, l) <= 150
    )
    if (nearby) {
      await updateLocationsCatalogEntry(nearby.id, {
        hydro_station_id: station.objID, hydro_station_name: station.name, hydro_stream_name: station.stream,
      })
      return nearby.id
    }
    const { data, error } = await supabase.from('locations').insert({
      group_id: groupId, created_by: userId, name: label || revir || 'Bod', revir: revir || null,
      lat: point.lat, lng: point.lng, scope: 'spot',
      hydro_station_id: station.objID, hydro_station_name: station.name, hydro_stream_name: station.stream,
    }).select().single()
    if (error) { console.warn('Nepodařilo se uložit stanici do katalogu:', error); return null }
    await loadLocationsCatalog()
    return data.id
  }

  async function deleteLocationFromCatalog(id) {
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) { alert(error.message); return }
    await loadLocationsCatalog()
  }

  // Sdílená logika pro přepočet area/lat/lng (a případně revíru u úlovků)
  // podle AKTUÁLNÍ podoby propojených katalogových míst -- používá ji jak
  // "🔄 Aktualizovat podle katalogu" u jedné výpravy, tak hromadná nabídka
  // po uložení revíru (vlastní i cizí, přes notifikační zvoneček).
  async function bulkUpdateSessionsForLocations(sessionsToUpdate, catalogOverride) {
    // catalogOverride: appka ho použije, když voláme HNED po vlastním
    // uložení revíru -- await loadLocationsCatalog() sice pošle appce
    // čerstvá data, ale samotná TATO funkce by pořád četla starou hodnotu
    // "locationsCatalog" zachycenou při svém spuštění (React state se
    // neaktualizuje uprostřed už běžící funkce). Bez override hrozí, že by
    // se výprava přepočítala podle PŘEDCHOZÍHO tvaru revíru, ne podle
    // právě uloženého nového.
    const catalog = catalogOverride || locationsCatalog
    for (const session of sessionsToUpdate) {
      const linkedIds = (session.session_locations || []).map((sl) => sl.location_id)
      if (linkedIds.length === 0) continue
      const linked = catalog.filter((l) => linkedIds.includes(l.id))
      const areaLocations = linked.filter((l) => l.area)
      const updates = {}
      if (areaLocations.length > 0) {
        const areas = areaLocations.flatMap((l) => normalizeAreas(l.area).map((points) => ({ location_id: l.id, points })))
        updates.area = areas
        const c = areaCentroid(areas.flatMap((a) => a.points))
        updates.lat = c.lat
        updates.lng = c.lng
      } else if (linked[0]) {
        updates.lat = linked[0].lat
        updates.lng = linked[0].lng
      }
      await supabase.from('sessions').update(updates).eq('id', session.id)
      if (linked.length === 1) {
        await supabase.from('catches').update({ location_id: linked[0].id, revir: linked[0].revir || null }).eq('session_id', session.id)
      }
    }
    await loadSessions()
  }

  async function updateSessionFromLocations(session) {
    await bulkUpdateSessionsForLocations([session])
  }

  // Spočítá "novinky" pro zvoneček -- za běhu, z už načtených dat (žádná
  // samostatná tabulka notifikací). Podle notifications_seen_at appka
  // pozná, co je nové JEN PRO TOHOTO uživatele -- appka nikdy nedělá
  // novinky zpětně, jen od poslední chvíle, kdy je uživatel viděl.
  function computeNotifications() {
    const seenAt = myProfile?.notifications_seen_at
    if (!seenAt) return []
    const seenTime = new Date(seenAt).getTime()
    const items = []

    sessions.forEach((s) => {
      if (s.user_id === userId) return
      if (s.created_at && new Date(s.created_at).getTime() > seenTime) {
        items.push({ type: 'session', key: `session-${s.id}`, time: s.created_at, session: s })
      }
      ;(s.catches || []).forEach((c) => {
        if (c.created_at && new Date(c.created_at).getTime() > seenTime) {
          items.push({ type: 'catch', key: `catch-${c.id}`, time: c.created_at, catchData: c, session: s })
        }
      })
    })

    locationsCatalog.forEach((l) => {
      if (l.created_by === userId) return // vlastní úpravy appka nabízí rovnou při ukládání, ne přes zvoneček
      if (locallyHandledLocationIds.has(l.id)) return
      if (!l.updated_at || new Date(l.updated_at).getTime() <= seenTime) return
      const mySessions = sessions.filter((s) => s.user_id === userId && (s.session_locations || []).some((sl) => sl.location_id === l.id))
      if (mySessions.length === 0) return
      items.push({ type: 'location', key: `location-${l.id}-${l.updated_at}`, time: l.updated_at, location: l, mySessions })
    })

    return items.sort((a, b) => new Date(b.time) - new Date(a.time))
  }

  function openNotifications() {
    setShowNotifications(true)
  }

  async function closeNotifications() {
    setShowNotifications(false)
    const now = new Date().toISOString()
    setMyProfile((prev) => (prev ? { ...prev, notifications_seen_at: now } : prev))
    await supabase.from('profiles').update({ notifications_seen_at: now }).eq('id', userId)
  }

  async function confirmLocationNotificationUpdate(item) {
    await bulkUpdateSessionsForLocations(item.mySessions)
    setLocallyHandledLocationIds((prev) => new Set(prev).add(item.location.id))
  }

  function openLocationMenu(session) {
    setMobileSheetOpen(false)
    const hasLinked = (session.session_locations || []).length > 0
    if (!hasLinked) { startAttachLocationsToSession(session); return }
    setLocationActionMenuFor(session)
  }

  function startAttachLocationsToSession(session) {
    const linkedIds = (session.session_locations || []).map((sl) => sl.location_id)
    setAttachingLocationsSessionId(session.id)
    setPickingCatalogIds(linkedIds)
    setLocationPickerStep('attach')
  }

  async function proceedAttachLocations() {
    const sessionId = attachingLocationsSessionId
    const pickedIds = pickingCatalogIds
    setLocationPickerStep(null)
    setAttachingLocationsSessionId(null)
    setPickingCatalogIds([])
    if (!sessionId) return

    // nahradí navázaná místa přesně tím, co je zaškrtnuté (i odškrtnutí něčeho stávajícího)
    await supabase.from('session_locations').delete().eq('session_id', sessionId)
    if (pickedIds.length > 0) {
      await supabase.from('session_locations').insert(
        pickedIds.map((location_id) => ({ session_id: sessionId, location_id }))
      )
    }

    const picked = locationsCatalog.filter((l) => pickedIds.includes(l.id))
    const updates = {}
    if (picked.length > 0) {
      updates.title = mergeLocationNames(picked)
      updates.revir = mergeLocationRevirs(picked)
      const areaLocations = picked.filter((l) => l.area)
      if (areaLocations.length > 0) {
        const areas = areaLocations.flatMap((l) => normalizeAreas(l.area).map((points) => ({ location_id: l.id, points })))
        updates.area = areas
        const c = areaCentroid(areas.flatMap((a) => a.points))
        updates.lat = c.lat
        updates.lng = c.lng
      } else {
        updates.area = null
        updates.lat = picked[0].lat
        updates.lng = picked[0].lng
      }
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('sessions').update(updates).eq('id', sessionId)
      if (error) { alert(error.message); return }
    }
    // jednoznačný případ (přesně 1 vybrané místo) -> rovnou propsat revír/vazbu do všech úlovků výpravy
    if (picked.length === 1) {
      await supabase.from('catches').update({ location_id: picked[0].id, revir: picked[0].revir || null }).eq('session_id', sessionId)
    }
    await loadSessions()
  }

  async function setCatchLocation(catchId, locationId, revir) {
    const { error } = await supabase.from('catches').update({ location_id: locationId, revir }).eq('id', catchId)
    if (error) { alert(error.message); return }
    setTicketCatch((prev) => (prev && prev.id === catchId ? { ...prev, location_id: locationId, revir } : prev))
    await loadSessions()
  }

  function goToMyLocation() {
    if (!navigator.geolocation) { alert('Tento prohlížeč neumí zjistit pozici.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const target = activePanel === 'map' ? mapTabInstance.current : mapInstance.current
        target?.setView([pos.coords.latitude, pos.coords.longitude], 16)
      },
      () => alert('Nepodařilo se zjistit pozici. Zkontroluj, že appka má povolení k lokaci.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  function duplicateSession(s) {
    const rods = (s.rods || []).map((r) => ({
      name: r.name, lat: r.lat, lng: r.lng,
      baits: (r.baits && r.baits.length
        ? r.baits
        : (r.bait ? [{ name: r.bait, photo_url: r.bait_photo_url }] : [{ name: '' }])
      ).map((b) => ({ name: b.name, photo_url: b.photo_url || null, photoFile: null })),
    }))
    setDraftSession({
      type: s.type, title: s.title, date: '', timeFrom: '', timeTo: '',
      revir: s.revir || '', target_species: s.target_species || '',
      temp: '', pressure: '', wind: '', desc: '',
      point: { lat: s.lat, lng: s.lng }, area: s.area ? normalizeSessionAreas(s.area) : null,
      rods: rods.length ? rods : [{ name: 'Prut 1', lat: s.lat, lng: s.lng, baits: [{ name: '', photoFile: null }] }],
      linkedLocationIds: (s.session_locations || []).map((sl) => sl.location_id),
    })
  }

  function exportData() {
    const payload = sessions.map((s) => ({
      typ: s.type, nazev: s.title, revir: s.revir, cil: s.target_species,
      datum: s.session_date, cas_od: s.time_from, cas_do: s.time_to,
      autor: userName(s.user_id),
      pocasi: { teplota_c: s.weather_temp_c, tlak_hpa: s.weather_pressure_hpa, vitr: s.weather_wind, popis: s.weather_desc },
      pozice: { lat: s.lat, lng: s.lng },
      oblast: s.area || null,
      pruty: (s.rods || []).map((r) => ({
        nazev: r.name, pozice: { lat: r.lat, lng: r.lng },
        nastrahy: (r.baits || []).map((b) => ({ nazev: b.name, foto: b.photo_url })),
      })),
      ulovky: (s.catches || []).map((c) => ({
        druh: c.species, kategorie: c.category, delka_cm: c.length_cm, vaha_kg: c.weight_kg,
        nastraha: c.bait, cas: c.caught_at, revir: c.revir,
        pozice: { lat: c.lat, lng: c.lng }, foto: c.photo_url, foto_nastrahy: c.bait_photo_url,
      })),
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nahodit-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function createInvite() {
    const { data, error } = await supabase
      .from('group_invites')
      .insert({ group_id: groupId, created_by: userId })
      .select()
      .single()
    if (!error) setInviteInfo(data)
  }

  // --- začátek tvorby nové výpravy ---
  // Před spuštěním nové výpravy appka mapu (tu sdílenou, na Výpravách)
  // vrátí na aktuální pozici záložky Mapa -- appka tak ukáže stejné pozadí
  // jako naposledy na Mapě, ne to, kde sdílená mapa náhodou zůstala od
  // prohlížení jiné výpravy.
  function restoreRememberedMapView() {
    if (!mapTabInstance.current || !mapInstance.current) return
    const c = mapTabInstance.current.getCenter()
    mapInstance.current.setView([c.lat, c.lng], mapTabInstance.current.getZoom(), { animate: false })
  }
  function startNewSession() { restoreRememberedMapView(); pendingLiveRef.current = false; setPickingType(true); setMobileSheetOpen(false); setActivePanel(null) }
  function startNewSessionLive() { restoreRememberedMapView(); pendingLiveRef.current = true; setPickingType(true); setMobileSheetOpen(false); setActivePanel(null) }

  async function endLiveSession(session) {
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 5)
    const { error } = await supabase.from('sessions').update({ time_to: timeStr, status: 'completed' }).eq('id', session.id)
    if (error) { alert(error.message); return }
    await loadSessions()
  }

  function chooseType(type) {
    setPickingType(false)
    pendingTypeRef.current = type
    if (AREA_TYPES.includes(type)) {
      // Přívlač zatím beze změny -- řeší se v příští dávce (celé odstranění
      // plochy/polygonu je větší zásah, zaslouží si vlastní pozornost).
      setLocationPickerStep('choose')
    } else if (pendingLiveRef.current) {
      // Živá výprava: appka je fyzicky na místě, GPS dává smysl vždycky.
      startGpsFlow()
    } else {
      // Zpětná výprava: appka NENÍ fyzicky na místě (zapisuje se třeba
      // večer doma) -- GPS by zachytilo jen AKTUÁLNÍ polohu appky, ne
      // místo, kam se výprava zpětně zapisuje. Appka proto rovnou nabídne
      // ruční umístění bodu na mapě -- "nejbližší z historie" se appka
      // stejně zeptá, jen AŽ PO umístění bodu (viz finishRodPointsManual).
      startManualShorePointPlacement()
    }
  }

  function startDrawNew() {
    setLocationPickerStep(null)
    pendingPointModeCatalogRef.current = null
    const type = pendingTypeRef.current
    if (AREA_TYPES.includes(type)) {
      beginAreaDrawing('area-point')
    } else {
      setRodPointsDraft([])
      setPlacementTarget('session-point')
    }
  }

  // --- mezikrok "jak nakreslit oblast?" -- ručně (jako dosud) vs. auto podle
  // břehu (nová metoda, viz lib/riverShape.js). Používá se všude, kde appka
  // dřív rovnou spouštěla ruční kreslení -- výsledek se v obou případech
  // vloží do stejného areaDraft.areas, takže vše po dokreslení (tlačítka
  // "Hotovo"/"Přidat oblast(i)"/"Uložit novou oblast") funguje beze změny.
  function beginAreaDrawing(resumeTarget) {
    setMobileSheetOpen(false)
    setAreaDrawChoice({ resumeTarget })
  }

  function chooseManualDrawing() {
    const resumeTarget = areaDrawChoice?.resumeTarget
    setAreaDrawChoice(null)
    setAreaDraft({ areas: [], current: [] })
    setPlacementTarget(resumeTarget)
  }

  function chooseRiverDrawing() {
    riverResumeTargetRef.current = areaDrawChoice?.resumeTarget
    setAreaDrawChoice(null)
    setRiverError(null)
    setRiverLineDraft({ points: [] })
    setPlacementTarget('river-line-point')
  }

  function cancelAreaDrawChoice() {
    setAreaDrawChoice(null)
    // pro případ, že appka čekala na dokončení "append" callbacku (viz
    // startAddAreaPoint) -- ať Zrušit tady fakt celou akci ukončí
    pendingAreaAppendRef.current = null
  }

  function undoRiverLinePoint() {
    setRiverLineDraft((prev) => (prev ? { points: prev.points.slice(0, -1) } : prev))
  }

  // +/- tlačítka vedle číselných polí -- na mobilu je spolehlivější klikat
  // na krok než mazat a přepisovat číslici (viz poznámka o vstupním poli
  // koridoru, které se předtím při smazání okamžitě vracelo na výchozích 80).
  function stepRiverCorridorWidth(delta) {
    setRiverCorridorWidth((prev) => {
      const n = Number(prev) || 80
      return Math.max(5, n + delta)
    })
  }

  function stepRiverOvershoot(delta) {
    setRiverOvershoot((prev) => {
      const n = Number(prev) || 0
      return Math.max(0, n + delta)
    })
  }

  // Zrušit jde kdykoli -- i uprostřed čekání na Overpass. Přeruší i
  // případný rozjetý požadavek (viz riverAbortRef), ať appka nezůstane
  // "viset" bez možnosti se z toho dostat.
  function cancelRiverLine() {
    riverAbortRef.current?.abort()
    riverAbortRef.current = null
    setRiverLineDraft(null)
    setRiverConfirm(null)
    setPlacementTarget(null)
    setRiverError(null)
    setRiverBusy(false)
    riverResumeTargetRef.current = null
    pendingAreaAppendRef.current = null
  }

  async function generateRiverArea() {
    if (!riverLineDraft || riverLineDraft.points.length < 2) return
    setRiverBusy(true)
    setRiverError(null)
    const controller = new AbortController()
    riverAbortRef.current = controller
    // Bezpečnostní pojistka navíc k ručnímu Zrušit -- kdyby appka i přes
    // vlastní serverovou logiku "visela" nepřiměřeně dlouho. Nastaveno těsně
    // nad worst-case proxy (4 servery x 4s = ~16s), ne o moc víc.
    const safetyTimeout = setTimeout(() => controller.abort(), 18000)
    try {
      const useSnap = riverSnapEnabled && lastRiverCutRef.current
      const snapLabelForThisGeneration = useSnap ? snapSourceLabel : null
      const snapSkippedReason = null

      const { areas: polygons, startCut, endCut } = await buildRiverAreasFromLine(riverLineDraft.points, {
        corridorWidthMeters: Number(riverCorridorWidth) || 80,
        overshootMeters: Number(riverOvershoot) || 0,
        signal: controller.signal,
        previousCut: useSnap ? lastRiverCutRef.current : undefined,
      })
      if (!polygons || polygons.length === 0) {
        setRiverError('Nepodařilo se najít použitelnou vodní plochu podél tvé čáry. Zkus přidat víc bodů, zvětšit šířku koridoru, nebo nakresli oblast ručně.')
      } else {
        // Start PRVNÍ plochy v týhle editaci appka uloží stranou -- bude to
        // "začátek" celého revíru, uchovatelný pro navázání jiného revíru
        // i mnohem později (viz sessionFirstStartCutRef, ukládá se do
        // locations.edge_cuts při finálním uložení).
        if (!sessionFirstStartCutRef.current) sessionFirstStartCutRef.current = startCut
        // Konec téhle plochy si appka zapamatuje -- kdyby uživatel hned
        // navazoval další plochou, půjde se na ni napojit stejně přesně.
        lastRiverCutRef.current = endCut
        setRiverSnapAvailable(!!endCut)
        // Nemerguje se rovnou do areaDraft -- appka nejdřív ukáže výsledek
        // a nechá potvrdit "Použít", ať se needěje neprošená rovnou do
        // starého "Hotovo/Přidat oblast(i)" panelu bez možnosti si to
        // nejdřív prohlédnout.
        setRiverConfirm({ polygons, usedSnap: !!useSnap, usedSnapLabel: snapLabelForThisGeneration, snapSkippedReason })
        // Popisek zdroje se aktualizuje na "právě vygenerováno" TEĎ, až po
        // uložení do riverConfirm výše -- jinak by potvrzovací panel ukázal
        // tenhle obecný text místo skutečného zdroje (revíru z katalogu),
        // co appka pro tuhle konkrétní plochu opravdu použila.
        setSnapSourceLabel('tuto plochu (právě vygenerováno)')
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setRiverError('Generování zrušeno.')
      } else {
        setRiverError('Nepodařilo se získat data o řece: ' + err.message + '. Zkus to znovu za chvíli, nebo nakresli oblast ručně.')
      }
    }
    clearTimeout(safetyTimeout)
    riverAbortRef.current = null
    setRiverBusy(false)
  }

  // Zavolá se po kliknutí "Použít" v potvrzovacím kroku -- teprve teď appka
  // přidá vygenerovanou plochu do areaDraft a rovnou (bez dalšího kliknutí)
  // spustí tu samou dokončovací funkci, jakou by appka spustila po ručním
  // "Hotovo, pokračovat"/"Přidat oblast(i)". Dokončovací funkce čtou
  // areaDraft ze stavu komponenty, ne z parametru -- proto se nespouští
  // hned tady (viděly by starou hodnotu před aktualizací), ale přes
  // pendingConfirmActionRef v navazujícím useEffectu níž.
  function confirmRiverArea() {
    if (!riverConfirm) return
    const polygons = riverConfirm.polygons
    const resumeTarget = riverResumeTargetRef.current
    riverResumeTargetRef.current = null
    setRiverConfirm(null)
    setRiverLineDraft(null)
    setPlacementTarget(null)
    setAutoAdvancingArea(true)
    // Appka teď zůstane přiblížená tam, kde uživatel zrovna kreslil -- bez
    // téhle pojistky by se hned po dokončení (areaDraft se vyprázdní) znovu
    // spustilo "přeostři mapu na všechny revíry" a zoom by zase odskočil.
    suppressLocationsFitRef.current = true
    pendingConfirmActionRef.current =
      resumeTarget === 'relocate-area-point' ? 'proceedRelocateArea'
      : resumeTarget === 'area-point-append' ? 'finishAppendArea'
      : 'proceedToForm'
    setAreaDraft((prev) => ({ areas: [...(prev?.areas || []), ...polygons], current: [] }))
  }

  function retryRiverGeneration() {
    setRiverConfirm(null)
    setRiverError(null)
  }

  function togglePickingCatalogId(id) {
    setPickingCatalogIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function proceedFromCatalogSelection() {
    const type = pendingTypeRef.current
    const picked = locationsCatalog.filter((l) => pickingCatalogIds.includes(l.id))
    setLocationPickerStep(null)
    setPickingCatalogIds([])
    if (picked.length === 0) return

    const revir = mergeLocationRevirs(picked)
    const title = mergeLocationNames(picked)

    if (AREA_TYPES.includes(type)) {
      const areaPicked = picked.filter((l) => l.area)
      if (areaPicked.length === 0) {
        alert('Žádné z vybraných míst nemá uloženou oblast — pro přívlač zvol místo s vyšrafovanou plochou, nebo nakresli novou.')
        return
      }
      const areas = areaPicked.flatMap((l) => normalizeAreas(l.area).map((points) => ({ location_id: l.id, points })))
      const overallCentroid = areaCentroid(areas.flatMap((a) => a.points))
      const firstAreaCentroid = areaCentroid(areas[0].points)
      const live = liveDefaults()
      setDraftSession({
        type, title, date: live.date, timeFrom: live.timeFrom, timeTo: '', revir, target_species: '',
        temp: '', pressure: '', wind: '', desc: '',
        point: overallCentroid, area: areas,
        rods: [{ name: 'Prut 1', lat: firstAreaCentroid.lat, lng: firstAreaCentroid.lng, baits: [{ name: '', photoFile: null }] }],
        live: live.live,
        linkedLocationIds: picked.map((l) => l.id),
      })
    } else {
      const first = picked[0]
      if (first && first.lat != null && first.lng != null) mapInstance.current?.setView([first.lat, first.lng], 15)
      pendingPointModeCatalogRef.current = { revir, title, locationIds: picked.map((l) => l.id) }
      setRodPointsDraft([])
      setPlacementTarget('session-point')
    }
  }

  function undoAreaPoint() {
    setAreaDraft((prev) => ({ ...prev, current: prev.current.slice(0, -1) }))
  }

  function cancelAreaOrPoint() {
    setAreaDraft(null)
    setRodPointsDraft(null)
    setPlacementTarget(null)
    pendingPointModeCatalogRef.current = null
    pendingGpsShorePointRef.current = null
    setGpsConfirmStep(null)
  }

  function undoRodPoint() {
    setRodPointsDraft((prev) => (prev || []).slice(0, -1))
  }

  // Sdílené dokončení nové výpravy -- appka ho volá jak z klikání
  // prutů/míst (finishRodPoints, uživatel sám klikne "Hotovo,
  // pokračovat"), tak přímo z potvrzení jména u přívlače (appka tam
  // žádné další klikání nechce, viz pickGpsMatch/confirmGpsManual níže
  // -- u přívlače appka nikdy neřeší víc míst, jen jeden bod výpravy).
  function finalizeNewSession(points, shorePoint, catalogInfo) {
    const isLure = LURE_TYPES.includes(pendingTypeRef.current)
    const first = points[0]
    const rods = isLure
      ? [{ name: 'Nástraha', lat: first.lat, lng: first.lng, baits: [{ name: '', photoFile: null }] }]
      : points.map((p, i) => ({ name: `Prut ${i + 1}`, lat: p.lat, lng: p.lng, baits: [{ name: '', photoFile: null }] }))
    setPlacementTarget(null)
    setRodPointsDraft(null)
    const live = liveDefaults()
    setDraftSession({
      type: pendingTypeRef.current,
      title: catalogInfo?.title || '', date: live.date, timeFrom: live.timeFrom, timeTo: '',
      revir: catalogInfo?.revir || '', target_species: '',
      temp: '', pressure: '', wind: '', desc: '',
      point: shorePoint || first, area: null,
      rods,
      live: live.live,
      linkedLocationIds: catalogInfo?.locationIds || [],
    })
  }

  function finishRodPoints() {
    if (!rodPointsDraft || rodPointsDraft.length === 0) return
    const catalogInfo = pendingPointModeCatalogRef.current
    pendingPointModeCatalogRef.current = null
    const shorePoint = pendingGpsShorePointRef.current
    pendingGpsShorePointRef.current = null
    finalizeNewSession(rodPointsDraft, shorePoint, catalogInfo)
  }

  function finishCurrentArea() {
    if (areaDraft.current.length < 3) return
    setAreaDraft({ areas: [...areaDraft.areas, areaDraft.current], current: [] })
  }

  function liveDefaults() {
    if (!pendingLiveRef.current) return { live: false, date: '', timeFrom: '' }
    const now = new Date()
    return {
      live: true,
      date: now.toISOString().slice(0, 10),
      timeFrom: now.toTimeString().slice(0, 5),
    }
  }

  function proceedToForm() {
    const rawAreas = areaDraft.current.length >= 3 ? [...areaDraft.areas, areaDraft.current] : areaDraft.areas
    if (rawAreas.length === 0) return
    const areas = rawAreas.map((points) => ({ location_id: null, points }))
    const overallCentroid = areaCentroid(areas.flatMap((a) => a.points))
    const firstAreaCentroid = areaCentroid(areas[0].points)
    setAreaDraft(null)
    setPlacementTarget(null)
    const live = liveDefaults()
    setDraftSession({
      type: pendingTypeRef.current,
      title: '', date: live.date, timeFrom: live.timeFrom, timeTo: '', revir: '', target_species: '',
      temp: '', pressure: '', wind: '', desc: '',
      point: overallCentroid, area: areas,
      rods: [{ name: 'Prut 1', lat: firstAreaCentroid.lat, lng: firstAreaCentroid.lng, baits: [{ name: '', photoFile: null }] }],
      live: live.live,
    })
  }

  // --- obecné "přidej mi jednu nebo víc oblastí" — použitelné jak v rozepsaném formuláři, tak u už uložené výpravy ---
  const pendingAreaAppendRef = useRef(null)
  const [addAreaStep, setAddAreaStep] = useState(null) // null | 'choose' | 'catalog' -- mezikrok "jak přidat další oblast?"
  const [addAreaCatalogIds, setAddAreaCatalogIds] = useState([])

  function startAddAreaPoint(onComplete, offerCatalog = false) {
    pendingAreaAppendRef.current = onComplete
    setMobileSheetOpen(false) // ať je na mobilu vidět mapa, appka to dřív nechávala schované za lištou
    if (offerCatalog) {
      setAddAreaStep('choose')
    } else {
      beginAreaDrawing('area-point-append')
    }
  }

  function startAddAreaManualFromChoice() {
    setAddAreaStep(null)
    beginAreaDrawing('area-point-append')
  }

  // Řeší případ, kdy appka U TÉTO KONKRÉTNÍ akce už má vlastní mezikrok
  // (addAreaStep 'choose' s volbami "Z katalogu"/"Naklikat nové") -- tam
  // přidáváme třetí tlačítko rovnou, bez dalšího vnořeného mezikroku.
  function startAddAreaRiverFromChoice() {
    setAddAreaStep(null)
    riverResumeTargetRef.current = 'area-point-append'
    setRiverError(null)
    setRiverLineDraft({ points: [] })
    setPlacementTarget('river-line-point')
  }

  function toggleAddAreaCatalogId(id) {
    setAddAreaCatalogIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function proceedAddAreaFromCatalog() {
    const picked = locationsCatalog.filter((l) => addAreaCatalogIds.includes(l.id) && l.area)
    setAddAreaStep(null)
    setAddAreaCatalogIds([])
    if (picked.length === 0) return
    const shaped = picked.flatMap((l) => normalizeAreas(l.area).map((points) => ({ location_id: l.id, points })))
    const cb = pendingAreaAppendRef.current
    pendingAreaAppendRef.current = null
    cb?.(shaped)
  }

  function finishAppendArea() {
    const areas = areaDraft.current.length >= 3 ? [...areaDraft.areas, areaDraft.current] : areaDraft.areas
    if (areas.length === 0) return
    setAreaDraft(null)
    setPlacementTarget(null)
    const cb = pendingAreaAppendRef.current
    pendingAreaAppendRef.current = null
    cb?.(areas)
  }

  function startAddCatch() {
    const rods = activeSession?.rods || []
    if (LURE_TYPES.includes(activeSession?.type)) {
      // Přívlač: appka VŽDY vyžaduje přesný klik na mapu -- "místo" u
      // přívlače je jen obecné stanoviště (odkud se házelo všemi směry),
      // ne přesná poloha záběru, takže appka ho nikdy nenabídne jako zkratku.
      chooseCatchOnMap()
      setMobileSheetOpen(false)
      return
    }
    if (rods.length === 1) {
      // jediný prut ve výpravě -- appka ho rovnou přiřadí, ať se nemusí zbytečně
      // potvrzovat "na jaké pozici?", když stejně není z čeho vybírat
      chooseCatchOnRod(rods[0])
      setMobileSheetOpen(false)
      return
    }
    setCatchChoosing(true)
    setMobileSheetOpen(false)
  }

  function chooseCatchOnRod(rod) {
    setCatchChoosing(false)
    const knownPhoto = rod.bait ? baitPhotoLookup()[rod.bait.trim().toLowerCase()] : null
    setDraftCatch({ point: { lat: rod.lat, lng: rod.lng }, species: '', category: TYPE_CATEGORY[activeSession?.type] || 'dravec', length: '', weight: '', weightEstimated: false, bait: rod.bait || '', rodId: rod.id, time: activeSession?.status === 'in_progress' ? nowHHMM() : '', photoFile: null, baitPhotoFile: null, bait_photo_url: knownPhoto || null, revir: activeSession?.revir || '' })
  }

  function chooseCatchOnMap() {
    setCatchChoosing(false)
    if (activeSession?.lat != null && activeSession?.lng != null) {
      mapInstance.current?.setView([activeSession.lat, activeSession.lng], 18)
    }
    setPlacementTarget('catch-point')
  }

  async function saveSession() {
    if (!navigator.onLine) {
      alert('Nejsi připojený k internetu. Zkus to znovu, až se signál vrátí — rozepsaná výprava zůstává vyplněná, nic se neztratilo.')
      return
    }
    const s = draftSession
    try {
      const { data: session, error: sErr } = await supabase
        .from('sessions')
        .insert({
          group_id: groupId, user_id: userId, type: s.type, title: s.title, revir: s.revir || null, target_species: s.target_species || null,
          session_date: s.date, time_from: s.timeFrom || null, time_to: s.timeTo || null,
          lat: s.point.lat, lng: s.point.lng, area: s.area,
          weather_temp_c: s.temp || null, weather_pressure_hpa: s.pressure || null, weather_pressure_trend: s.pressureTrend ?? null,
          weather_wind: s.wind || null, weather_desc: s.desc || null,
          water_level_cm: s.waterLevel ?? null, water_flow_m3s: s.waterFlow ?? null, water_temp_c: s.waterTemp ?? null,
          water_station_name: s.waterStationName || null, water_data_precision: s.waterPrecision || null, water_spa_level: s.waterSpaLevel ?? null,
          water_stations: s.waterStations || null,
          status: s.live ? 'in_progress' : 'completed',
        }).select().single()
      if (sErr) { alert(sErr.message); return }

      if (s.linkedLocationIds && s.linkedLocationIds.length > 0) {
        await supabase.from('session_locations').insert(
          s.linkedLocationIds.map((location_id) => ({ session_id: session.id, location_id }))
        )
      }

      for (const r of s.rods.filter((r) => r.name)) {
        const baitsPayload = []
        for (const b of (r.baits || [])) {
          if (!b.name && !b.photoFile && !b.photo_url) continue
          let photo_url = b.photo_url || null
          let photo_thumb_url = b.photo_thumb_url || null
          if (b.photoFile) {
            const uploaded = await uploadPhoto(b.photoFile, `baits/${session.id}`)
            if (uploaded) {
              photo_url = uploaded.url
              photo_thumb_url = uploaded.thumbUrl
              backfillBaitPhoto(b.name, photo_url, photo_thumb_url)
            }
          }
          baitsPayload.push({ name: b.name, photo_url, photo_thumb_url })
        }
        await supabase.from('rods').insert({
          session_id: session.id, group_id: groupId, name: r.name,
          bait: baitsPayload.map((b) => b.name).filter(Boolean).join(', ') || null,
          lat: r.lat, lng: r.lng, baits: baitsPayload,
        })
      }

      setDraftSession(null)
      await loadSessions()
      setActiveId(session.id)
      setViewMode('detail')
      showToast('✓ Výprava uložena')
    } catch (err) {
      alert('Uložení se nepovedlo (možná vypadlo připojení). Formulář zůstává vyplněný, zkus to prosím znovu.\n\n' + err.message)
    }
  }

  async function saveCatch() {
    if (!navigator.onLine) {
      alert('Nejsi připojený k internetu. Zkus to znovu, až se signál vrátí — rozepsaný úlovek zůstává vyplněný, nic se neztratilo.')
      return
    }
    const c = draftCatch
    const session = activeSession
    try {
      const catchDate = c.time && session ? actualDateForTime(session.session_date, session.time_from, c.time) : session?.session_date
      const caughtAt = c.time && catchDate
        ? new Date(`${catchDate}T${c.time}:00`).toISOString()
        : null
      let photo_url = null
      let photo_thumb_url = null
      if (c.photoFile) {
        const uploaded = await uploadPhoto(c.photoFile, `catches/${session.id}`)
        if (uploaded) { photo_url = uploaded.url; photo_thumb_url = uploaded.thumbUrl }
      }
      let bait_photo_url = c.bait_photo_url || null
      let bait_photo_thumb_url = c.bait_photo_thumb_url || null
      if (c.baitPhotoFile) {
        const uploaded = await uploadPhoto(c.baitPhotoFile, `catches/${session.id}`)
        if (uploaded) {
          bait_photo_url = uploaded.url
          bait_photo_thumb_url = uploaded.thumbUrl
          backfillBaitPhoto(c.bait, bait_photo_url, bait_photo_thumb_url)
        }
      }
      // jednoznačný případ (výprava má navázané jen jedno katalogové místo) -> rovnou přiřadit i novému úlovku
      const linkedIds = (session.session_locations || []).map((sl) => sl.location_id)
      let location_id = null
      let revir = c.revir || null
      if (linkedIds.length === 1) {
        const loc = locationsCatalog.find((l) => l.id === linkedIds[0])
        if (loc) { location_id = loc.id; revir = loc.revir || null }
      }
      const { error } = await supabase.from('catches').insert({
        session_id: session.id, group_id: groupId, rod_id: c.rodId || null,
        species: c.species, category: c.category, length_cm: c.length || null, weight_kg: c.weight || null, weight_estimated: c.weight ? !!c.weightEstimated : false,
        bait: c.bait, caught_at: caughtAt, lat: c.point.lat, lng: c.point.lng,
        photo_url, photo_thumb_url, bait_photo_url, bait_photo_thumb_url,
        location_id, revir,
        weather_temp_c: c.weather_temp_c ?? null, weather_pressure_hpa: c.weather_pressure_hpa ?? null, weather_pressure_trend: c.weather_pressure_trend ?? null,
        weather_wind: c.weather_wind || null, weather_desc: c.weather_desc || null,
        water_level_cm: c.water_level_cm ?? null, water_flow_m3s: c.water_flow_m3s ?? null, water_temp_c: c.water_temp_c ?? null,
        water_station_name: c.water_station_name || null, water_data_precision: c.water_data_precision || null, water_spa_level: c.water_spa_level ?? null,
      })
      if (error) { alert(error.message); return }
      setDraftCatch(null)
      await loadSessions()
      showToast('✓ Úlovek uložen')
    } catch (err) {
      alert('Uložení se nepovedlo (možná vypadlo připojení). Formulář zůstává vyplněný, zkus to prosím znovu.\n\n' + err.message)
    }
  }

  function startEditSession(s) {
    setEditingSession({
      id: s.id, type: s.type, title: s.title, date: s.session_date, revir: s.revir || '', target_species: s.target_species || '',
      timeFrom: s.time_from || '', timeTo: s.time_to || '',
      temp: s.weather_temp_c ?? '', pressure: s.weather_pressure_hpa ?? '', pressureTrend: s.weather_pressure_trend ?? null,
      wind: s.weather_wind || '', desc: s.weather_desc || '',
      waterLevel: s.water_level_cm ?? null, waterFlow: s.water_flow_m3s ?? null, waterTemp: s.water_temp_c ?? null,
      waterStationName: s.water_station_name || null, waterPrecision: s.water_data_precision || null, waterSpaLevel: s.water_spa_level ?? null,
      waterStations: s.water_stations || null,
      linkedLocationIds: (s.session_locations || []).map((sl) => sl.location_id),
      lat: s.lat, lng: s.lng, area: s.area,
    })
  }

  async function saveEditSession() {
    if (!navigator.onLine) {
      alert('Nejsi připojený k internetu. Zkus to znovu, až se signál vrátí — rozepsané úpravy zůstávají vyplněné, nic se neztratilo.')
      return
    }
    const e = editingSession
    try {
      const { error } = await supabase.from('sessions').update({
        title: e.title, session_date: e.date, revir: e.revir || null, target_species: e.target_species || null, time_from: e.timeFrom || null, time_to: e.timeTo || null,
        weather_temp_c: e.temp || null, weather_pressure_hpa: e.pressure || null, weather_pressure_trend: e.pressureTrend ?? null,
        weather_wind: e.wind || null, weather_desc: e.desc || null,
        water_level_cm: e.waterLevel ?? null, water_flow_m3s: e.waterFlow ?? null, water_temp_c: e.waterTemp ?? null,
        water_station_name: e.waterStationName || null, water_data_precision: e.waterPrecision || null, water_spa_level: e.waterSpaLevel ?? null,
        water_stations: e.waterStations || null,
      }).eq('id', e.id)
      if (error) { alert(error.message); return }
      // Kaskáda počasí i na úlovky z téhle výpravy -- appka dřív nechávala úlovky
      // na starých hodnotách (např. starý směr větru), i když se výprava přepočítala.
      // Prochází úlovky jednotlivě (stejný ověřený vzor jako backfillBaitPhoto/
      // renameBaitEverywhere) místo jednoho hromadného UPDATE, ať se to spolehlivě
      // propíše i při víc úlovcích. Vodní stav se sem záměrně nepropisuje -- úlovek
      // může mít vlastní přesnější stanici (viz "📍 Revír" u výpravy s víc revíry).
      const sessionCatches = sessions.find((s) => s.id === e.id)?.catches || []
      for (const c of sessionCatches) {
        await supabase.from('catches').update({
          weather_temp_c: e.temp || null, weather_pressure_hpa: e.pressure || null, weather_pressure_trend: e.pressureTrend ?? null,
          weather_wind: e.wind || null, weather_desc: e.desc || null,
        }).eq('id', c.id)
      }
      setEditingSession(null)
      await loadSessions()
      showToast('✓ Uloženo')
    } catch (err) {
      alert('Uložení se nepovedlo (možná vypadlo připojení). Zkus to prosím znovu.\n\n' + err.message)
    }
  }

  function monthLabel(dateStr) {
    const d = new Date(dateStr)
    const label = d.toLocaleDateString('cs-CZ', { month: 'long' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  function buildGroups(list) {
    const years = []
    let curYear = null, curMonth = null
    list.forEach((s) => {
      const d = new Date(s.session_date)
      const y = d.getFullYear()
      const monthKey = `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!curYear || curYear.year !== y) {
        curYear = { year: y, key: `year:${y}`, months: [] }
        years.push(curYear)
        curMonth = null
      }
      if (!curMonth || curMonth.key !== `month:${monthKey}`) {
        curMonth = { key: `month:${monthKey}`, label: monthLabel(s.session_date), sessions: [] }
        curYear.months.push(curMonth)
      }
      curMonth.sessions.push(s)
    })
    return years
  }

  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const collapseInitRef = useRef(false)
  useEffect(() => {
    if (collapseInitRef.current || sessions.length === 0) return
    collapseInitRef.current = true
    const groups = buildGroups(sessions)
    const allKeys = new Set()
    groups.forEach((y) => { allKeys.add(y.key); y.months.forEach((m) => allKeys.add(m.key)) })
    // nejnovější rok a měsíc necháme rozbalené, zbytek sbalíme
    if (groups.length) {
      allKeys.delete(groups[0].key)
      if (groups[0].months.length) allKeys.delete(groups[0].months[0].key)
    }
    setCollapsedGroups(allKeys)
  }, [sessions])

  // Při aktivním hledání appka dočasně rozbalí úplně vše (ať vidíš všechny
  // výsledky napříč lety/měsíci bez ručního rozklikávání) a po smazání textu
  // se vrátí přesně na to, co bylo rozbalené/sbalené předtím.
  const savedCollapsedGroupsRef = useRef(null)
  useEffect(() => {
    if (searchQuery.trim()) {
      if (savedCollapsedGroupsRef.current === null) savedCollapsedGroupsRef.current = collapsedGroups
      setCollapsedGroups(new Set())
    } else if (savedCollapsedGroupsRef.current !== null) {
      setCollapsedGroups(savedCollapsedGroupsRef.current)
      savedCollapsedGroupsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  function toggleGroup(key) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function expandAll() { setCollapsedGroups(new Set()) }
  function collapseAll() {
    const groups = buildGroups(visibleSessions)
    const allKeys = new Set()
    groups.forEach((y) => { allKeys.add(y.key); y.months.forEach((m) => allKeys.add(m.key)) })
    setCollapsedGroups(allKeys)
  }

  // Přepnutí panelu v hlavičce (Domů/Mapa/Výpravy/Úlovky) -- vždycky vede
  // přesně na daný panel (žádné přepínání zpátky na Výpravy při druhém
  // kliku na stejné tlačítko). Druhý (a každý další) klik na už aktivní
  // tlačítko navíc appka bere jako "vrať mě do výchozího stavu" -- zruší
  // detail/filtr/přiblížení toho panelu a appka ukáže jeho základní pohled.
  // Zároveň appka zruší jakékoli rozpracované umísťování na mapě (přesun
  // bodu, kreslení oblasti...) -- jinak by placementTarget zůstal nastavený
  // i po přechodu na jiný panel (viz cancelAllPlacementFlows níže).
  function switchPanel(panel) {
    cancelAllPlacementFlows()
    const isRepeat = activePanel === panel
    // appka uloží scrollovou pozici Domů těsně předtím, než z něj
    // odejde -- ať se po návratu jedním kliknutím vrátí přesně tam.
    if (activePanel === 'home' && panel !== 'home' && sidebarRef.current) {
      homeScrollRef.current = sidebarRef.current.scrollTop
    }
    if (panel === 'home') {
      pendingHomeScrollModeRef.current = isRepeat ? 'top' : 'restore'
      setHomeNavNonce((n) => n + 1) // appka zaručí, že se scroll efekt spustí i při druhém kliku (activePanel se textově nezmění)
    }
    setActivePanel(panel)
    setSearchQuery('')
    setCatchesCategory('all')
    // appka lištu u Mapy nechá sbalenou (jen pár filtrů, ať to na mapě
    // nezabírá zbytečně místo) -- u ostatních panelů ji otevře jako dřív.
    setMobileSheetOpen(panel !== 'map')
    setMapFocusSessionId(null)
    setMapFocusPoint(null)
    // Úlovky appka vždycky otevře na výchozím pohledu (polička druhů,
    // ne rozkliknutý konkrétní druh) -- appka to dřív resetovala jen při
    // druhém kliku na už aktivní záložku (isRepeat), takže příchod odjinud
    // (např. tlačítko "Zobrazit všechny úlovky" na Domů) appku nechal na naposledy prohlíženém druhu (třeba "Amuři").
    if (panel === 'catches') {
      setCatchesSortMode('species')
      setSpeciesGalleryKey(null)
      if (sidebarRef.current) sidebarRef.current.scrollTop = 0
      window.scrollTo(0, 0)
    }
    if (isRepeat) {
      if (panel === 'map') { setMapWho('both'); setMapWhat('catches'); mapForceResetRef.current = true; setMapResetNonce((n) => n + 1) }
      else if (panel === null) {
        setViewMode('aggregate'); setActiveCategory('all'); setActiveUserFilter('all')
        if (sidebarRef.current) sidebarRef.current.scrollTop = 0
        if (mobileSheetBodyRef.current) mobileSheetBodyRef.current.scrollTop = 0
        window.scrollTo(0, 0)
      }
    }
  }

  // Jedno centrální místo, co zruší úplně každý rozpracovaný "klikni na
  // mapu"/"vyber na mapě" flow -- volané při přepnutí panelu (switchPanel),
  // ať appka nezůstane v mezistavu, kdy si mapNeededForInteraction myslí,
  // že appka mapu ještě potřebuje, i když uživatel už dávno odešel jinam.
  function cancelAllPlacementFlows() {
    riverAbortRef.current?.abort()
    riverAbortRef.current = null
    riverResumeTargetRef.current = null
    pendingAreaAppendRef.current = null
    pendingPointModeCatalogRef.current = null
    pendingGpsShorePointRef.current = null
    addRodToSessionRef.current = null
    relocateSessionIdRef.current = null
    relocateCatchIdRef.current = null
    gpsRequestIdRef.current++
    setPlacementTarget(null)
    setAreaDraft(null)
    setRodPointsDraft(null)
    setRiverLineDraft(null)
    setRiverConfirm(null)
    setRiverError(null)
    setRiverBusy(false)
    setAreaDrawChoice(null)
    setGpsCapturing(false)
    setGpsConfirmStep(null)
    setCatchChoosing(false)
    setPickingType(false)
    setLocationPickerStep(null)
    setPickingCatalogIds([])
    setAddAreaStep(null)
    setAddAreaCatalogIds([])
    setEditingAreasSession(null)
    setEditingAreasLocation(null)
    setSavingLocationFor(null)
    setAttachingLocationsSessionId(null)
  }

  // Appka řadí výpravy vždycky od nejnovější nahoru, takže samostatné
  // tlačítko "Nejnovější" bylo jen duplicitní cesta k tomu, co udělá i
  // scroll/sbalení nahoru -- appka ho odstranila (viz jedno přepínací
  // tlačítko Rozbalit/Sbalit vše níže).
  function isAllExpanded(list) {
    const groups = buildGroups(list)
    return groups.every((y) => !collapsedGroups.has(y.key) && y.months.every((m) => !collapsedGroups.has(m.key)))
  }

  function startRelocateCatch(catchId) {
    relocateCatchIdRef.current = catchId
    const c = sessions.flatMap((s) => s.catches || []).find((cc) => cc.id === catchId)
    if (c?.lat != null && c?.lng != null) mapInstance.current?.setView([c.lat, c.lng], 19)
    setTicketCatch(null)
    setMobileSheetOpen(false)
    setPlacementTarget('relocate-catch')
  }

  async function handleRelocateSession() {
    const s = editingSession
    await saveEditSession()
    relocateSessionIdRef.current = s.id
    if (s.lat != null && s.lng != null) mapInstance.current?.setView([s.lat, s.lng], 19)
    setMobileSheetOpen(false)
    setPlacementTarget('relocate-session-point')
  }

  // Přesun bodu appka nabízí rovnou na kartě výpravy, ne uvnitř editace
  // ostatních polí (datum, počasí...) -- ty appka ukládá až tlačítkem
  // "Uložit změny", kdežto přesun bodu appka ukládá OKAMŽITĚ po kliknutí
  // na mapu. Kdyby appka tohle nechala uvnitř editačního formuláře,
  // vzniklo by matoucí míchání dvou různých způsobů ukládání na jednom
  // místě -- takhle jsou od sebe jasně oddělené.
  function startRelocateFromCard(session) {
    relocateSessionIdRef.current = session.id
    if (session.lat != null && session.lng != null) mapInstance.current?.setView([session.lat, session.lng], 19)
    setMobileSheetOpen(false)
    setPlacementTarget('relocate-session-point')
  }

  // Appka doskočí ze detailu výpravy rovnou na záložku Mapa, ale appka
  // NEukáže celou agregovanou mapu se všemi vrstvami -- appka rovnou
  // přepne do fokusovaného režimu (jen tahle výprava, viz mapFocusSessionId
  // výše). Appka tím vyřeší i výpravy s víc body (přívlač) -- appka
  // ukáže všechny, ne jen jeden zvýrazněný marker uprostřed cizích.
  function jumpToMapView(session, focusPoint) {
    switchPanel('map')
    setMapFocusSessionId(session.id)
    setMapFocusPoint(focusPoint || null)
    setMobileSheetOpen(false)
  }

  // Appka umožní přidat nový prut k UŽ ULOŽENÉ výpravě -- na rozdíl od
  // "+ další prut" ve formuláři nové výpravy (co existuje jen PŘED
  // uložením), tohle appka nabízí přímo v detailu hotové výpravy.
  // Jen pro bodové typy (kapr/muška/plavaná) -- přívlač má od appky
  // vlastní, jednodušší cestu (addLureBaitToSession níže), žádné
  // klikání na mapu navíc, protože u přívlače appka žádnou samostatnou
  // pozici nástrahy neřeší -- je to vždycky bod výpravy.
  function startAddRodToSession(session) {
    addRodToSessionRef.current = { sessionId: session.id, type: session.type }
    setMobileSheetOpen(false)
    // Appka mapu přiblíží, ať uživatel rovnou vidí, kam kliknout -- u víc
    // už existujících míst (typicky přívlač) appka ukáže všechna najednou,
    // ať je vidět, kde už se chytalo, a kam přidat další.
    const existingPoints = (session.rods || [])
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => [r.lat, r.lng])
    if (existingPoints.length > 1) {
      mapInstance.current?.fitBounds(existingPoints, { padding: [60, 60], maxZoom: 18 })
    } else if (existingPoints.length === 1) {
      mapInstance.current?.setView(existingPoints[0], 18)
    } else if (session.lat != null && session.lng != null) {
      mapInstance.current?.setView([session.lat, session.lng], 17)
    }
    setPlacementTarget('add-rod-to-session')
  }

  // U přívlače appka nástrahu ukládá jako jediný "prut" na stejné
  // souřadnici jako bod výpravy (žádné samostatné místo/klik navíc) --
  // pokud appka zjistí, že výprava žádnou nemá (např. po smazání), appka
  // rovnou vytvoří novou prázdnou, ať appka má vůbec kam nástrahu zapsat.
  async function addLureBaitToSession(session) {
    const { error } = await supabase.from('rods').insert({
      session_id: session.id, group_id: groupId, name: 'Nástraha',
      lat: session.lat, lng: session.lng, baits: [],
    })
    if (error) { alert(error.message); return }
    await loadSessions()
  }

  // Přidá další místo k UŽ ULOŽENÉ výpravě rovnou přes GPS -- appka tohle
  // nabízí jen dokud výprava PRÁVĚ PROBÍHÁ (status 'in_progress', appka
  // je fyzicky na místě). U dokončené/zpětné výpravy appka GPS nenabízí
  // (appka by zachytila AKTUÁLNÍ polohu, ne místo, kde uživatel tehdy
  // stál) -- tam zůstává ruční klik na mapu (startAddRodToSession).
  async function addLurePlaceViaGps(session) {
    if (!navigator.geolocation) { alert('Tento prohlížeč neumí zjistit polohu.'); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const existingCount = (session.rods || []).length
        const { error } = await supabase.from('rods').insert({
          session_id: session.id, group_id: groupId, name: `Místo ${existingCount + 1}`,
          lat: point.lat, lng: point.lng, baits: [],
        })
        if (error) { alert(error.message); return }
        await loadSessions()
      },
      () => alert('Nepodařilo se zjistit polohu. Zkontroluj, že appka má povolení k lokaci.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // Smazání "dalšího místa" u přívlače -- na rozdíl od RodEditRow appka
  // tady nepotřebuje celý formulář (žádná nástraha se u dalších míst
  // neřeší), stačí přímé potvrzení a smazání.
  async function deleteLurePlace(rod) {
    if (!window.confirm('Smazat tohle místo?')) return
    const { error } = await supabase.from('rods').delete().eq('id', rod.id)
    if (error) { alert(error.message); return }
    await loadSessions()
  }

  // Přesun libovolného místa u přívlače -- první místo appka přesouvá
  // úplně stejně jako hlavní bod výpravy (jsou to koneckonců stejná data,
  // viz startRelocateFromCard), další místa mají vlastní jednoduchý flow.
  function startRelocateLurePlace(session, rod) {
    const isMain = session.rods?.[0]?.id === rod.id
    if (isMain) { startRelocateFromCard(session); return }
    if (rod.lat != null && rod.lng != null) mapInstance.current?.setView([rod.lat, rod.lng], 19)
    setMobileSheetOpen(false)
    setPlacementTarget(`relocate-lure-place-${rod.id}`)
  }

  function startManageAreas(session) {
    setEditingAreasSession({ id: session.id, areas: normalizeSessionAreas(session.area) })
    setEditingSession(null)
    setMobileSheetOpen(false)
  }

  function removeManagedArea(idx) {
    setEditingAreasSession((prev) => ({ ...prev, areas: prev.areas.filter((_, i) => i !== idx) }))
  }

  // Manuální kreslení appce dřív vracelo vždycky obyčejné pole bodů; teď může
  // přijít i rovnou "obarvené" katalogovým místem (viz proceedAddAreaFromCatalog).
  // Tahle funkce sjednotí obojí do stejného tvaru {location_id, points}.
  function normalizeAppendedAreas(newAreas) {
    return newAreas.map((entry) => (entry && entry.points ? entry : { location_id: null, points: entry }))
  }

  function addAreasToManaged(newAreas) {
    const incoming = normalizeAppendedAreas(newAreas)
    setEditingAreasSession((prev) => {
      // Pokud appka přidává plochu se STEJNÝM katalogovým místem (location_id),
      // co už výprava má, appka ji NAHRADÍ, ne přidá vedle -- jinak by vznikla
      // duplicita (dvě plochy se stejným názvem, mírně odlišné souřadnice,
      // podle toho, kdy byla která vygenerovaná). Plochy bez location_id
      // (ryze ruční kreslení) se vždy jen přidávají, tam kolize nehrozí.
      const incomingIds = new Set(incoming.filter((a) => a.location_id).map((a) => a.location_id))
      const kept = prev.areas.filter((a) => !(a.location_id && incomingIds.has(a.location_id)))
      return { ...prev, areas: [...kept, ...incoming] }
    })
  }

  async function saveManagedAreas() {
    const { id, areas } = editingAreasSession
    const updates = { area: areas.length ? areas : null }
    if (areas.length) {
      const overallCentroid = areaCentroid(areas.flatMap((a) => a.points))
      updates.lat = overallCentroid.lat
      updates.lng = overallCentroid.lng
    }
    await supabase.from('sessions').update(updates).eq('id', id)
    if (areas.length) {
      const firstAreaCentroid = areaCentroid(areas[0].points)
      const { data: rods } = await supabase.from('rods').select('id').eq('session_id', id).order('created_at').limit(1)
      if (rods && rods[0]) {
        await supabase.from('rods').update({ lat: firstAreaCentroid.lat, lng: firstAreaCentroid.lng }).eq('id', rods[0].id)
      }
    }
    setEditingAreasSession(null)
    await loadSessions()
    setActiveId(id)
    setViewMode('detail')
  }

  function startManageLocationAreas(location) {
    const areas = normalizeAreas(location.area)
    setEditingAreasLocation({ id: location.id, areas: areas.map((a) => [...a]) })
    setShowLocations(false)
    const bounds = areas.flat().map((p) => [p.lat, p.lng])
    if (bounds.length) mapInstance.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
  }

  function removeManagedLocationArea(idx) {
    setEditingAreasLocation((prev) => ({ ...prev, areas: prev.areas.filter((_, i) => i !== idx) }))
  }

  function addAreasToManagedLocation(newAreas) {
    setEditingAreasLocation((prev) => ({ ...prev, areas: [...prev.areas, ...newAreas] }))
  }

  async function saveManagedLocationAreas() {
    const { id, areas } = editingAreasLocation
    const updates = { area: areas.length ? areas : null }
    if (areas.length) {
      const c = areaCentroid(areas.flat())
      updates.lat = c.lat
      updates.lng = c.lng
    }
    // Metadata řezu se přepíšou, jen pokud appka v týhle editaci fakt něco
    // vygenerovala podle břehu -- jinak (čistě ruční úprava) appka nechá
    // stávající edge_cuts v DB beze změny, ať omylem nesmaže platná
    // metadata z dřívějška jen proto, že tentokrát nebyla použita.
    if (sessionFirstStartCutRef.current || lastRiverCutRef.current) {
      updates.edge_cuts = { start: sessionFirstStartCutRef.current || null, end: lastRiverCutRef.current || null }
    }
    await supabase.from('locations').update(updates).eq('id', id)
    setEditingAreasLocation(null)
    resetRiverSnapMemory()
    // Ať appka po uložení zůstane přiblížená na tomhle místě, ne že po
    // znovunačtení katalogu (locationsCatalog se změní) skočí zpátky na
    // přehled všech revírů.
    suppressLocationsFitRef.current = true
    await loadLocationsCatalog()
    setShowLocations(true)

    // Rovnou při ukládání (ne přes zvoneček -- o týhle změně už uživatel
    // ví, protože ji sám dělá) appka nabídne aktualizaci VLASTNÍCH výprav,
    // co tenhle revír používají. Cizí výpravy appka takhle nabízet nesmí
    // (RLS by update stejně odmítla) -- ty se dozví přes zvoneček sami.
    const mySessions = sessions.filter(
      (s) => s.user_id === userId && (s.session_locations || []).some((sl) => sl.location_id === id)
    )
    if (mySessions.length > 0) {
      const ok = window.confirm(
        `Tenhle revír používá ${mySessions.length} tvých ${mySessions.length === 1 ? 'výpravu' : mySessions.length < 5 ? 'výpravy' : 'výprav'}. Aktualizovat jejich pozici/tvar podle nové podoby?`
      )
      if (ok) {
        // Předá se čerstvě uložený tvar přímo (ne spoléhat na to, že
        // "locationsCatalog" v Reactu už stihl doběhnout na nová data --
        // viz komentář u bulkUpdateSessionsForLocations).
        const freshCatalog = locationsCatalog.map((l) => (l.id === id ? { ...l, ...updates } : l))
        await bulkUpdateSessionsForLocations(mySessions, freshCatalog)
      }
    }
  }

  function proceedRelocateArea() {
    const rawAreas = areaDraft.current.length >= 3 ? [...areaDraft.areas, areaDraft.current] : areaDraft.areas
    if (rawAreas.length === 0) return
    const areas = rawAreas.map((points) => ({ location_id: null, points }))
    const overallCentroid = areaCentroid(areas.flatMap((a) => a.points))
    const firstAreaCentroid = areaCentroid(areas[0].points)
    const sid = relocateSessionIdRef.current
    setAreaDraft(null)
    setPlacementTarget(null)
    ;(async () => {
      await supabase.from('sessions').update({ area: areas, lat: overallCentroid.lat, lng: overallCentroid.lng }).eq('id', sid)
      const { data: rods } = await supabase.from('rods').select('id').eq('session_id', sid).order('created_at').limit(1)
      if (rods && rods[0]) {
        await supabase.from('rods').update({ lat: firstAreaCentroid.lat, lng: firstAreaCentroid.lng }).eq('id', rods[0].id)
      }
      await loadSessions()
    })()
  }

  // Spustí se AŽ PO skutečné aktualizaci areaDraft (ne hned po setAreaDraft
  // v confirmRiverArea) -- proceedToForm/finishAppendArea/proceedRelocateArea
  // čtou areaDraft ze stavu komponenty, takže by hned po volání setAreaDraft
  // ve stejném tiku ještě viděly starou hodnotu (React state update je
  // asynchronní). Efekt s dependency [areaDraft] garantuje, že se spustí
  // až po skutečném přepsání stavu.
  useEffect(() => {
    if (!pendingConfirmActionRef.current) return
    const action = pendingConfirmActionRef.current
    pendingConfirmActionRef.current = null
    if (action === 'proceedToForm') proceedToForm()
    else if (action === 'finishAppendArea') finishAppendArea()
    else if (action === 'proceedRelocateArea') proceedRelocateArea()
    setAutoAdvancingArea(false)
  }, [areaDraft])

  async function deleteSession() {
    if (!window.confirm('Opravdu smazat celou výpravu včetně všech úlovků a prutů? Nedá se to vrátit zpět.')) return
    const deletingId = editingSession.id
    try {
      // Appka radši smaže navázané záznamy (místa, úlovky, pruty) sama,
      // po jedné tabulce, místo aby spoléhala jen na cascade delete v
      // databázi. Díky tomu appka umí přesně pojmenovat, KDE to selhalo
      // (např. RLS na úlovku přidaném jiným členem party), místo jedné
      // obecné chyby z velkého DELETE nad "sessions", po které appka
      // dřív nechala editační okno viset i s "dead" výpravou v seznamu.
      const { error: locErr } = await supabase.from('session_locations').delete().eq('session_id', deletingId)
      if (locErr) { alert('Nepodařilo se smazat propojení výpravy s místy: ' + locErr.message); return }
      const { error: catchErr } = await supabase.from('catches').delete().eq('session_id', deletingId)
      if (catchErr) { alert('Nepodařilo se smazat úlovky výpravy: ' + catchErr.message); return }
      const { error: rodErr } = await supabase.from('rods').delete().eq('session_id', deletingId)
      if (rodErr) { alert('Nepodařilo se smazat pruty výpravy: ' + rodErr.message); return }
      const { data, error } = await supabase.from('sessions').delete().eq('id', deletingId).select()
      if (error) { alert(error.message); return }
      if (!data || data.length === 0) {
        // Appka sem dorazí i v případě, že RLS delete "tiše" nesmaže nic
        // (0 řádků, ale bez chyby) -- appka to radši ohlásí rovnou, než
        // aby výprava jen zdánlivě zmizela z okna a appka na ni pak
        // hlásila "neexistuje" při dalším otevření ze seznamu.
        alert('Výpravu se nepodařilo smazat (appka k tomu nemá oprávnění, nebo už byla smazána).')
        return
      }
      // Appka hned zavře editační okno a rovnou odstraní výpravu i z
      // lokálního seznamu -- nečeká na doběhnutí loadSessions(), ať
      // výprava nezůstane byť na okamžik viset ve "Výpravách".
      setEditingSession(null)
      setSessions((prev) => prev.filter((s) => s.id !== deletingId))
      if (activeId === deletingId) { setActiveId(null); setViewMode('aggregate') }
      await loadSessions()
    } catch (err) {
      alert('Smazání se nepovedlo (možná vypadlo připojení). Zkus to prosím znovu.\n\n' + err.message)
    }
  }

  function allKnownBaits(category) {
    const set = new Set()
    sessions.forEach((s) => {
      if (category && TYPE_CATEGORY[s.type] !== category) return
      ;(s.rods || []).forEach((r) => {
        ;(r.baits || []).forEach((b) => { if (b.name) set.add(b.name.trim()) })
        if ((!r.baits || r.baits.length === 0) && r.bait) r.bait.split(',').forEach((n) => { const t = n.trim(); if (t) set.add(t) })
      })
    })
    baitCatalog.forEach((b) => {
      if (category && b.category && b.category !== category) return
      if (b.name) set.add(b.name.trim())
    })
    return Array.from(set).sort()
  }

  async function addBaitToCatalog(name, category) {
    const { data, error } = await supabase.from('baits')
      .insert({ group_id: groupId, created_by: userId, name, category })
      .select()
      .single()
    if (error) { alert(error.message); return null }
    await loadBaitCatalog()
    return data
  }

  function baitListId(type) {
    const cat = TYPE_CATEGORY[type]
    if (cat === 'dravec') return 'known-baits-dravec'
    if (cat === 'bila') return 'known-baits-bila'
    return 'known-baits-all'
  }

  function baitCategoryFor(type) {
    return TYPE_CATEGORY[type] || null
  }

  function mergedBaitOptions(category) {
    const map = {}
    baitCatalog.forEach((b) => {
      if (category && b.category && b.category !== category) return
      map[b.name.trim().toLowerCase()] = { id: b.id, name: b.name.trim(), photo_url: b.photo_url, category: b.category }
    })
    sessions.forEach((s) => {
      const guessCategory = TYPE_CATEGORY[s.type] || null
      ;(s.rods || []).forEach((r) => {
        const entries = []
        ;(r.baits || []).forEach((b) => { if (b.name) entries.push({ name: b.name.trim(), photo_url: b.photo_url || null }) })
        if ((!r.baits || r.baits.length === 0) && r.bait) entries.push({ name: r.bait.trim(), photo_url: r.bait_photo_url || null })
        entries.forEach(({ name, photo_url }) => {
          if (category && guessCategory && guessCategory !== category) return
          const key = name.toLowerCase()
          if (!key || map[key]) return
          map[key] = { id: key, name, photo_url, category: guessCategory }
        })
      })
      ;(s.catches || []).forEach((c) => {
        if (!c.bait) return
        if (category && c.category !== category) return
        const key = c.bait.trim().toLowerCase()
        if (map[key]) return
        map[key] = { id: key, name: c.bait.trim(), photo_url: c.bait_photo_url || null, category: c.category }
      })
    })
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }

  // Užší varianta mergedBaitOptions -- při zápisu úlovku appka dřív nabízela
  // celý katalog (i nástrahy z úplně jiných výprav/kategorií). Tohle vrátí jen
  // nástrahy skutečně zapsané u prutů TÉTO konkrétní výpravy.
  function sessionBaitOptions(session) {
    const map = {}
    const guessCategory = TYPE_CATEGORY[session?.type] || null
    ;(session?.rods || []).forEach((r) => {
      const entries = []
      ;(r.baits || []).forEach((b) => { if (b.name) entries.push({ name: b.name.trim(), photo_url: b.photo_url || null }) })
      if ((!r.baits || r.baits.length === 0) && r.bait) entries.push({ name: r.bait.trim(), photo_url: r.bait_photo_url || null })
      entries.forEach(({ name, photo_url }) => {
        const key = name.toLowerCase()
        if (!key || map[key]) return
        map[key] = { id: key, name, photo_url, category: guessCategory }
      })
    })
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }

  function allKnownSpecies() {
    const set = new Set()
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => { if (c.species) set.add(c.species.trim()) })
    })
    return Array.from(set).sort()
  }

  function baitPhotoLookup() {
    const map = {}
    baitCatalog.forEach((b) => { if (b.name && b.photo_url) map[b.name.trim().toLowerCase()] = b.photo_url })
    sessions.forEach((s) => {
      ;(s.rods || []).forEach((r) => {
        ;(r.baits || []).forEach((b) => { if (b.name && b.photo_url) map[b.name.trim().toLowerCase()] = b.photo_url })
      })
      ;(s.catches || []).forEach((c) => { if (c.bait && c.bait_photo_url) map[c.bait.trim().toLowerCase()] = c.bait_photo_url })
    })
    return map
  }

  function sessionMatchesSearch(s, query) {
    const q = normalizeSearchText(query)
    if (!q) return true
    if (normalizeSearchText(s.title).includes(q)) return true
    if (normalizeSearchText(s.revir).includes(q)) return true
    if (normalizeSearchText(s.target_species).includes(q)) return true
    if ((s.catches || []).some((c) => normalizeSearchText(c.species).includes(q) || normalizeSearchText(c.bait).includes(q))) return true
    return false
  }

  const visibleSessions = sessions.filter((s) => {
    const catOk = activeCategory === 'all' || TYPE_CATEGORY[s.type] === activeCategory || filteredCatches(s).length > 0
    const userOk = activeUserFilter === 'all' || s.user_id === activeUserFilter
    const searchOk = sessionMatchesSearch(s, searchQuery)
    return catOk && userOk && searchOk
  })

  function peekLabel() {
    if (activePanel === 'home') return <><IconHome size={15} color="var(--water-deep)" /> Domů</>
    if (activePanel === 'stations') return <><IconDroplet size={15} color="var(--water-deep)" /> Měrné stanice</>
    if (activePanel === 'map') return <><IconMap size={15} color="var(--water-deep)" /> Mapa</>
    if (activePanel === 'locations') return <><IconRevir size={15} color="var(--water-deep)" dotColor="#fff" /> Revíry · {locationsCatalog.length}</>
    if (activePanel === 'baits') return <><IconNastraha size={15} color="var(--water-deep)" /> Nástrahy</>
    if (activePanel === 'catches') return <><IconUlovek size={15} color="var(--water-deep)" /> Úlovky</>
    if (viewMode === 'detail' && activeSession) return activeSession.title
    const parts = []
    if (activeCategory !== 'all') parts.push(activeCategory === 'dravec' ? 'Dravci' : 'Bílá ryba')
    if (activeUserFilter !== 'all') parts.push(userName(activeUserFilter))
    const catchCount = visibleSessions.reduce((sum, s) => sum + filteredCatches(s).length, 0)
    const prefix = parts.length ? parts.join(' · ') + ' · ' : ''
    return `${prefix}${visibleSessions.length} výprav · ${catchCount} úlovků`
  }

  const isPlacingSomething = placementTarget === 'session-point' || placementTarget === 'shore-point-click' || placementTarget === 'catch-point' || placementTarget === 'relocate-session-point' || placementTarget === 'relocate-catch' || placementTarget === 'new-location-point' || placementTarget === 'add-rod-to-session' || areaDraft || riverLineDraft || rodPointsDraft || (placementTarget && (placementTarget.startsWith('rod-') || placementTarget.startsWith('edit-rod-') || placementTarget.startsWith('relocate-lure-place-')))

  // Výpravy a Úlovky mají velkou mapu skrytou (viz layout níže), ale pořád
  // potřebují klikat na mapu při zakládání/úpravě výpravy nebo přesunu bodu.
  // Tahle proměnná pokrývá úplně každý stav, co appka ukazuje jako panel
  // přímo nad mapou (type-picker, place-hint, potvrzení oblasti...) --
  // kdykoli je pravdivá, appka mapu vrátí zpátky bez ohledu na aktivní panel.
  const mapNeededForInteraction = !!(
    isPlacingSomething || pickingType || locationPickerStep || gpsCapturing || gpsConfirmStep ||
    catchChoosing || areaDrawChoice || riverConfirm || editingAreasSession || editingAreasLocation || savingLocationFor
  )

  // Na mobilu appka Výpravy v klidu (nic se neumísťuje) ukáže jako statický
  // panel přes celou obrazovku, stejně jako appka dělá u Úlovky -- ne jako
  // sbalitelnou lištu nad mapou, protože mapa je stejně schovaná.
  const mobileFullPanel = activePanel === null && !mapNeededForInteraction

  // Appka appku na mobilu scrolluje jako běžnou stránku (žádné vnitřní
  // scroll-boxy jako dřív) -- dlouhý seznam (Domů/Výpravy/Úlovky) tak
  // appku mohl nechat odscrollovanou daleko dolů, a appka se pak na
  // panelu s mapou (mnohem kratší stránka) zobrazila mimo záběr, jako
  // by lišta zmizela úplně. Appka proto při každé změně panelu/pohledu
  // appku vrátí na začátek stránky, bez ohledu na to, kterým
  // konkrétním tlačítkem se tam uživatel dostal.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activePanel, viewMode])

  // Na "Domů" a dalších panelech bez mapy appka mapu jen schová přes CSS
  // (display:none), ne že by ji odpojila z DOM -- Leaflet instance tak
  // zůstává živá, jen si při schování zapamatuje rozměry 0x0. Při návratu
  // na panel s mapou je potřeba Leafletu říct "přepočítej si rozměry
  // znovu", jinak by se dlaždice mohly vykreslit jen zčásti/špatně. Malé
  // zpoždění, ať CSS stihne mapu zase zviditelnit dřív, než Leaflet měří
  // kontejner.
  useEffect(() => {
    if (!mapInstance.current) return
    const mapHidden = activePanel === 'home' || activePanel === 'stations' || activePanel === 'map' ||
      activePanel === 'records' || activePanel === 'stats' || activePanel === 'help' || activePanel === 'settings' ||
      ((activePanel === 'catches' || activePanel === 'baits' || activePanel === null) && !mapNeededForInteraction)
    if (mapHidden) return
    const t = setTimeout(() => mapInstance.current?.invalidateSize(), 50)
    return () => clearTimeout(t)
  }, [activePanel, mapNeededForInteraction])

  // --- postranní panel/mobilní lišta v režimu "🗺 Mapa" — přepínatelné vrstvy + hledání míst ---
  // --- panel "Měrné stanice" (☰ Více) -- appka ukáže stanice ČHМÚ nejblíž
  // místům, kde parta chytá (průměr GPS bodů vlastních výprav, jinak
  // střed Česka jako rozumný výchozí bod). Aktuální stav appka natáhne
  // až na vyžádání (klik na řádek), ne pro všechny najednou dopředu.
  async function loadNearbyStations() {
    setStationsLoading(true)
    const myPoints = sessions.filter((s) => s.user_id === userId && s.lat != null && s.lng != null)
    const ref = myPoints.length
      ? {
          lat: myPoints.reduce((sum, p) => sum + p.lat, 0) / myPoints.length,
          lng: myPoints.reduce((sum, p) => sum + p.lng, 0) / myPoints.length,
        }
      : { lat: 49.8, lng: 15.5 }
    try {
      const list = await findNearestStations(ref.lat, ref.lng, 12)
      setStationsList(list)
    } catch {
      setStationsList([])
    }
    setStationsLoading(false)
  }

  async function toggleStationConditions(station) {
    if (expandedStationId === station.objID) { setExpandedStationId(null); return }
    setExpandedStationId(station.objID)
    if (!stationConditions[station.objID]) {
      const cond = await fetchLiveConditions(station.objID)
      setStationConditions((prev) => ({ ...prev, [station.objID]: cond }))
    }
  }

  function renderStationsPanel() {
    return (
      <>
        <div className="sb-head"><span>Měrné stanice</span></div>
        {stationsList === null ? (
          <div style={{ padding: '0 18px 14px' }}>
            <p className="hint-text" style={{ marginBottom: 10 }}>
              Appka ukáže stanice ČHМÚ nejblíž místům, kde parta obvykle chytá.
            </p>
            <button className="new-btn" onClick={loadNearbyStations} disabled={stationsLoading}>
              {stationsLoading ? 'Načítám…' : 'Načíst stanice v okolí'}
            </button>
          </div>
        ) : stationsList.length === 0 ? (
          <div style={{ padding: '0 18px 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
            Nepodařilo se načíst seznam stanic. <button className="new-btn" onClick={loadNearbyStations} style={{ marginLeft: 6 }}>Zkusit znovu</button>
          </div>
        ) : (
          stationsList.map((st) => {
            const cond = stationConditions[st.objID]
            const expanded = expandedStationId === st.objID
            return (
              <div key={st.objID} className="record-row" onClick={() => toggleStationConditions(st)}>
                <div className="record-head">
                  <strong>{st.name}</strong>
                  <span className="c-sub">{st.distanceKm.toFixed(1)} km</span>
                </div>
                <div className="c-sub">{st.stream}</div>
                {expanded && (
                  cond === undefined ? (
                    <p className="hint-text" style={{ marginTop: 8 }}>Zjišťuji aktuální stav…</p>
                  ) : cond === null ? (
                    <p className="hint-text" style={{ marginTop: 8 }}>Pro tuhle stanici se nepodařilo zjistit aktuální data.</p>
                  ) : (
                    <div className="weather-row" style={{ marginTop: 8 }}>
                      {cond.level_cm != null && <div className="w-item"><div className="num">{cond.level_cm} cm</div><div className="lab">vodní stav</div></div>}
                      {cond.flow_m3s != null && <div className="w-item"><div className="num">{cond.flow_m3s} m³/s</div><div className="lab">průtok</div></div>}
                      {cond.temp_c != null && <div className="w-item"><div className="num">{cond.temp_c}°C</div><div className="lab">teplota vody</div></div>}
                      {cond.spa_level != null && SPA_LEVEL_INFO[cond.spa_level] && (
                        <div className="w-item"><div className="num">{SPA_LEVEL_INFO[cond.spa_level].icon}</div><div className="lab">{SPA_LEVEL_INFO[cond.spa_level].label}</div></div>
                      )}
                    </div>
                  )
                )}
              </div>
            )
          })
        )}
      </>
    )
  }


  // appka používá stejné 4 tlačítka na dvou místech: nahoře v
  // hlavičce (desktop a mobil v běžné záložce prohlížeče) a dole jako
  // samostatnou lištu (appka nainstalovaná na plochu, kde ta lišta
  // funguje "position:sticky" -- viz styles.css). Appka sdílí
  // jednu definici, ať nemusí appka udržovat dvě
  // kopie stejného seznamu tlačítek.
  function renderTabButtons() {
    return (
      <>
        <button
          className={`new-btn ${activePanel === 'home' ? 'active-toggle' : ''}`}
          onClick={() => switchPanel('home')}
          title="Domů"
        ><IconHome size={15} /> <span className="nav-label">Domů</span></button>
        <button
          className={`new-btn ${activePanel === 'map' ? 'active-toggle' : ''}`}
          onClick={() => switchPanel('map')}
          title="Mapa"
        ><IconMap size={15} /> <span className="nav-label">Mapa</span></button>
        <button
          className={`new-btn ${activePanel === null ? 'active-toggle' : ''}`}
          onClick={() => switchPanel(null)}
          title="Výpravy"
        ><IconVyprava size={15} /> <span className="nav-label">Výpravy</span></button>
        <button
          className={`new-btn ${activePanel === 'catches' ? 'active-toggle' : ''}`}
          onClick={() => switchPanel('catches')}
          title="Úlovky"
        ><IconUlovek size={15} eyeColor="var(--water-deep)" /> <span className="nav-label">Úlovky</span></button>
      </>
    )
  }

  function renderMapControls() {
    const focusedSession = mapFocusSessionId ? sessions.find((s) => s.id === mapFocusSessionId) : null
    return (
      <>
        <div className="sb-head"></div>
        {focusedSession ? (
          <div style={{ margin: '0 18px 14px', padding: '10px 12px', background: 'var(--water-soft)', border: '1px solid var(--water-mid)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--water-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focusedSession.title}</span>
            <button className="new-btn" onClick={() => setMapFocusSessionId(null)} style={{ flex: 'none' }}><IconClose size={12} /> Celá mapa</button>
          </div>
        ) : (
          <div style={{ padding: '0 18px 6px' }}>
            <div className="field-label" style={{ margin: '0 0 4px' }}>Čí záznamy vidět</div>
            <div className="filter-row" style={{ padding: 0, marginBottom: 12 }}>
              {[['me', 'Moje'], ['party', 'Parta'], ['both', 'Všichni']].map(([val, label]) => (
                <button key={val} className={`filter-chip ${mapWho === val ? 'active' : ''}`} onClick={() => setMapWho(val)}>{label}</button>
              ))}
            </div>
            <div className="field-label" style={{ margin: '0 0 4px' }}>Co ukázat</div>
            <div className="filter-row" style={{ padding: 0 }}>
              {[
                ['trips', 'Výpravy', <IconVyprava key="i" size={13} color={mapWhat === 'trips' ? '#fff' : 'var(--water-deep)'} />],
                ['catches', 'Úlovky', <IconUlovek key="i" size={13} color={mapWhat === 'catches' ? '#fff' : 'var(--water-deep)'} />],
                ['both', 'Vše', null],
              ].map(([val, label, icon]) => (
                <button key={val} className={`filter-chip ${mapWhat === val ? 'active' : ''}`} onClick={() => setMapWhat(val)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  // --- postranní panel/mobilní lišta v režimu "📍 Revíry" — nezávislé na viewMode/activeId výprav, ty se drží beze změny v pozadí ---
  function renderLocationsList() {
    const q = normalizeSearchText(searchQuery)
    const sorted = [...locationsCatalog]
      .filter((l) => !q || normalizeSearchText(l.name).includes(q) || normalizeSearchText(l.revir).includes(q))
      .sort((a, b) => {
        // velké úseky (chytání z lodi) vždy nahoře, uvnitř obou skupin abecedně
        const aReach = a.scope === 'reach' ? 0 : 1
        const bReach = b.scope === 'reach' ? 0 : 1
        if (aReach !== bReach) return aReach - bReach
        return a.name.localeCompare(b.name)
      })
    return (
      <>
        <div className="sb-head">
          <span>Revíry</span>
          <button className="new-btn" onClick={startAddLocationArea}>+ Přidat místo</button>
        </div>
        <div style={{ padding: '0 18px 10px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', display: 'flex', pointerEvents: 'none' }}>
            <IconSearch size={15} />
          </span>
          <input
            className="text-input"
            style={{ paddingLeft: 34 }}
            placeholder="Hledat revír (název, číslo)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {sorted.length === 0 ? (
          <div style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontSize: 13 }}>
            {locationsCatalog.length === 0 ? 'Katalog je zatím prázdný. Zkus přidat první přes „+ Přidat místo".' : 'Nic nenalezeno.'}
          </div>
        ) : (
          sorted.map((l) => {
            const linkedSessions = sessions.filter((s) => (s.session_locations || []).some((sl) => sl.location_id === l.id))
            const catchCount = linkedSessions.reduce((sum, s) => sum + (s.catches || []).filter((c) => c.location_id === l.id).length, 0)
            return (
              <div key={l.id} className="record-row" onClick={() => { setLocationsReturnId(l.id); setBaitsInitialKey(null); setShowLocations(true) }}>
                <div className="record-head">
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {l.scope === 'reach'
                      ? <IconBoat size={16} color="var(--amber-deep)" />
                      : <IconRevir size={16} color="var(--water-deep)" dotColor="var(--paper)" />} {l.name}
                  </strong>
                  {l.revir && <span className="revir-chip">{l.revir}</span>}
                </div>
                <div className="c-sub" style={{ marginTop: 4 }}>
                  {l.scope === 'reach' && <span style={{ color: 'var(--amber-deep)', fontWeight: 600 }}>Velký úsek · </span>}
                  {linkedSessions.length} výprav · {catchCount} úlovků
                </div>
              </div>
            )
          })
        )}
      </>
    )
  }

  // --- postranní panel "🪱 Nástrahy" — stejný vzor jako Revíry/Výpravy: hledání + seznam, detail se otevírá jako modal (BaitsModal) ---
  function renderBaitsList() {
    const q = normalizeSearchText(searchQuery)
    const baits = computeBaitsList(sessions, baitCatalog)
      .filter((b) => !q || normalizeSearchText(b.label).includes(q))
      .sort((a, b) => b.catches.length - a.catches.length)
    return (
      <>
        <div className="sb-head">
          <span>Nástrahy</span>
          <button className="new-btn" onClick={() => { setBaitsInitialKey(null); setBaitsStartAdding(true); setShowBaits(true) }}>+ Přidat nástrahu</button>
        </div>
        <div style={{ padding: '0 18px 10px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', display: 'flex', pointerEvents: 'none' }}>
            <IconSearch size={15} />
          </span>
          <input
            className="text-input"
            style={{ paddingLeft: 34 }}
            placeholder="Hledat nástrahu…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {baits.length === 0 ? (
          <div style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontSize: 13 }}>
            {searchQuery ? 'Nic nenalezeno.' : 'Zatím žádné. Zkus přidat první přes „+ Přidat nástrahu".'}
          </div>
        ) : (
          baits.map((b) => (
            <div
              key={b.key} className="record-row"
              onClick={() => { setBaitsInitialKey(b.key); setBaitsStartAdding(false); setShowBaits(true) }}
            >
              <div className="record-head">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {b.photo_url
                    ? <img src={b.photo_thumb_url || b.photo_url} alt="" className="bait-thumb" style={{ marginLeft: 0, flex: 'none' }} />
                    : <span style={{ flex: 'none', display: 'flex' }}><IconNastraha size={18} color={b.category === 'dravec' ? 'var(--water-deep)' : 'var(--amber-deep)'} /></span>}
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</strong>
                </span>
                <span className="record-length">{b.catches.length}×</span>
              </div>
            </div>
          ))
        )}
      </>
    )
  }

  // --- postranní panel "🐟 Úlovky" — plochý seznam (bez seskupení podle měsíce), hledání jako primární způsob navigace ---
  // Jednoduchý "před X hodinami/dny" popisek pro feed na Domů -- appka nikde
  // jinde relativní čas nepotřebovala, proto vlastní malá funkce tady.
  function relativeTimeLabel(isoString) {
    if (!isoString) return ''
    const diffMs = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'právě teď'
    if (minutes < 60) return `před ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `před ${hours} h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `před ${days} ${days === 1 ? 'dnem' : 'dny'}`
    return new Date(isoString).toLocaleDateString('cs-CZ')
  }

  // --- Domů: žebříček party za aktuální kalendářní měsíc (1. -- poslední
  // den v měsíci podle lokálního data appky). Appka záměrně NEdělá
  // samostatnou obrazovku ani přepínač měsíc/sezóna -- jen pevné okno
  // "tenhle měsíc" přímo v kartě na Domů (rozhodnuto v konzultaci --
  // appka historii/celoroční přehled zatím neřeší, jde jen o rychlý
  // přehled aktivity party). Datum úlovku appka počítá stejným
  // pravidlem jako feed níž (caught_at, jinak session_date), ať jsou
  // obě appka karty konzistentní v tom, co počítají jako "kdy".
  // --- Domů: "podmínky dnes" -- index aktivity ryb zvlášť pro dravce a
  // bílou rybu, nahoře v přehledové kartě nad žebříčkem (appka je
  // schválně nedává na dvě samostatné kartičky vedle sebe, appka je drží
  // v jedné kartě spolu se žebříčkem, ať appka na Domů nepřidává druhou
  // celou kartu navíc).
  function renderTodayIndex() {
    if (todayIndex.status === 'loading') {
      return <div className="index-block index-loading">Počítám dnešní podmínky…</div>
    }
    if (todayIndex.status === 'error') return null
    return (
      <div className="index-block">
        <div className="leaderboard-head" style={{ borderTop: 'none' }}>
          <IconTrend size={15} />
          <span>Podmínky dnes</span>
        </div>
        <div className="index-row">
          {['dravec', 'bila'].map((cat) => {
            const r = todayIndex[cat]
            return (
              <div className={`index-cell category-${cat}`} key={cat}>
                <div className="index-cell-label">{cat === 'dravec' ? 'dravec' : 'bílá ryba'}</div>
                <div className="index-cell-value">
                  {r?.status === 'ready' ? r.level : 'zatím málo dat'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderHomeLeaderboard() {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const counts = {}
    members.forEach((m) => { counts[m.id] = 0 })
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => {
        const dateStr = c.caught_at || s.session_date
        if (!dateStr) return
        const d = new Date(dateStr)
        if (d >= monthStart) {
          counts[s.user_id] = (counts[s.user_id] || 0) + 1
        }
      })
    })
    const monthLabel = now.toLocaleDateString('cs-CZ', { month: 'long' })
    const ranked = members
      .map((m) => ({ ...m, count: counts[m.id] || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'cs'))
    const totalCatches = ranked.reduce((sum, m) => sum + m.count, 0)
    if (members.length === 0) return null
    return (
      <div className="leaderboard-card">
        {renderTodayIndex()}
        <div className="leaderboard-head" style={todayIndex.status !== 'error' ? { borderTop: '1px solid #EFEBDF' } : undefined}>
          <IconTrophy size={16} />
          <span>Žebříček party · {monthLabel}</span>
        </div>
        {totalCatches === 0 ? (
          <div className="leaderboard-empty">Tenhle měsíc zatím nikdo nic nechytil.</div>
        ) : (
          <div className="leaderboard-rows">
            {ranked.map((m, idx) => (
              <div className="leaderboard-row" key={m.id}>
                <span className={`leaderboard-rank ${idx === 0 && m.count > 0 ? 'first' : ''}`}>{idx + 1}</span>
                <span className="user-dot" style={{ background: userColor(m.id) }} />
                <span className="leaderboard-name">{m.name}</span>
                <span className="leaderboard-count">{m.count} {m.count === 1 ? 'úlovek' : m.count >= 2 && m.count <= 4 ? 'úlovky' : 'úlovků'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // --- Domů: feed posledních úlovků party, fotka jako dominanta karty ---
  function renderHomeFeed() {
    const all = []
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => all.push({ ...c, sessionRef: s }))
    })
    const sorted = all.sort((a, b) =>
      (b.caught_at || b.created_at || b.sessionRef.session_date || '').localeCompare(a.caught_at || a.created_at || b.sessionRef.session_date || '')
    )
    // Appka na Domů dřív rovnou zobrazila 20 úlovků (a appce s nimi 20
    // fotek) najednou -- i s náhledy je to víc, než se vejde na
    // obrazovku telefonu bez scrollování, a appka by čekala na
    // stažení fotek, co uživatel ještě ani neviděl. Appka teď ukáže
    // jen posledních 8 (pár řádků dlaždic) a na zbytek appka nabídne
    // tlačítko "Zobrazit všechny úlovky" (appka ho zobrazuje jen
    // stejně, o kolik víc jich je).
    const HOME_FEED_LIMIT = 8
    const shown = sorted.slice(0, HOME_FEED_LIMIT)
    return (
      <>
        <div className="sb-head"></div>
        {renderHomeLeaderboard()}
        {sorted.length === 0 ? (
          <div style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontSize: 13 }}>
            Zatím žádný úlovek — až někdo z party něco chytí, objeví se tady.
          </div>
        ) : (
          <>
            <div className="home-feed">
              {shown.map((c) => (
                <div
                  key={c.id} className="feed-card"
                  onClick={() => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) }}
                >
                  <div className="feed-card-photo">
                    {c.photo_url
                      ? <img src={c.photo_thumb_url || c.photo_url} alt={c.species} loading="lazy" decoding="async" />
                      : <div className="feed-card-photo-fallback" dangerouslySetInnerHTML={{ __html: fishSVG(CATEGORY_COLOR[c.category]) }} />}
                  </div>
                  <div className="feed-card-body">
                    <div className="feed-card-title">{c.species} {c.length_cm ? <span className="feed-card-length">{c.length_cm} cm</span> : null}</div>
                    <div className="feed-card-sub">
                      {userName(c.sessionRef.user_id)} · {c.sessionRef.title} · {relativeTimeLabel(c.caught_at || c.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {sorted.length > HOME_FEED_LIMIT && (
              <div style={{ padding: '4px 18px 20px', textAlign: 'center' }}>
                <button className="new-btn" onClick={() => switchPanel('catches')}>Zobrazit všechny úlovky ({sorted.length}) →</button>
              </div>
            )}
          </>
        )}
      </>
    )
  }

  function renderCatchesList() {
    const all = []
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => all.push({ ...c, sessionRef: s }))
    })
    const filtered = all
      .filter((c) => catchesCategory === 'all' || c.category === catchesCategory)

    const header = (
      <>
        <div className="sb-head"></div>
        <div className="filter-row">
          {['all', 'dravec', 'bila'].map((cat) => (
            <button
              key={cat}
              className={`filter-chip ${catchesCategory === cat ? `active ${cat}` : ''}`}
              onClick={() => { setCatchesCategory(cat); setDateListLimit(30); setUserGroupLimits({}) }}
            >
              {cat === 'all' ? 'Vše' : cat === 'dravec' ? 'Dravci' : 'Bílá ryba'}
            </button>
          ))}
        </div>
        <div className="filter-row">
          {[['species', 'Podle druhu'], ['date', 'Podle data'], ['user', 'Podle rybáře']].map(([val, label]) => (
            <button key={val} className={`filter-chip ${catchesSortMode === val ? 'active' : ''}`} onClick={() => { setCatchesSortMode(val); setSpeciesGalleryKey(null); setDateListLimit(30); setUserGroupLimits({}) }}>{label}</button>
          ))}
        </div>
      </>
    )

    if (filtered.length === 0) {
      return (
        <>
          {header}
          <div style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontSize: 13 }}>
            Zatím žádný úlovek.
          </div>
        </>
      )
    }

    function openCatch(c) { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) }

    function CatchRow({ c }) {
      const thumb = c.photo_thumb_url || c.photo_url
      return (
        <div
          className="record-row record-row-thumbed"
          style={{ borderLeft: `3px solid ${userColor(c.sessionRef.user_id)}` }}
          onClick={() => openCatch(c)}
        >
          <div className="record-row-thumb" style={{ background: thumb ? undefined : CATEGORY_COLOR[c.category] }}>
            {thumb
              ? <img src={thumb} alt={c.species} loading="lazy" />
              : <div style={{ width: 20 }} dangerouslySetInnerHTML={{ __html: fishSVG('#fff') }} />}
          </div>
          <div className="record-row-body">
            <div className="record-head">
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.species}</strong>
              <span className="record-length">{c.length_cm ?? '—'} cm</span>
            </div>
            <div className="c-sub" style={{ marginTop: 4 }}>
              {c.caught_at ? c.caught_at.slice(0, 10) : c.sessionRef.session_date} · {userName(c.sessionRef.user_id)} · {c.sessionRef.title}{c.revir ? ` · ${c.revir}` : ''}
            </div>
          </div>
        </div>
      )
    }

    const byDate = (a, b) => (b.caught_at || b.sessionRef.session_date || '').localeCompare(a.caught_at || a.sessionRef.session_date || '')

    // ---------- Podle data: appka to nechá jako obyčejný chronologický seznam --
    // ale nevypíše ho celý najednou. S velkou partou a delší
    // sezónou by appka uměla vykreslit stovky řádků s náhledovými fotkami naráz, což
    // by zbytečně stahovalo desítky fotek, co uživatel ani neuviděl bez
    // rolování. Appka teď ukáže jen prvních `dateListLimit` a zbytek
    // dotáhne až na vyžádání (tlačítko níž), stejně jako appka
    // dělá u feedu na Domů. ----------
    if (catchesSortMode === 'date') {
      const sorted = [...filtered].sort(byDate)
      const shown = sorted.slice(0, dateListLimit)
      return (
        <>
          {header}
          {shown.map((c) => <CatchRow key={c.id} c={c} />)}
          {sorted.length > shown.length && (
            <div style={{ padding: '14px 18px 20px', textAlign: 'center' }}>
              <button className="new-btn" onClick={() => setDateListLimit((n) => n + 30)}>
                Zobrazit další ({sorted.length - shown.length} zbývá)
              </button>
            </div>
          )}
        </>
      )
    }

    // ---------- Podle rybáře: appka seskupí podle uživatele, ale
    // zase nevykreslí každou skupinu celou najednou -- appka dá per
    // rybáři vlastní limit + vlastní tlačítko "Zobrazit další" (viz
    // userGroupLimits výš). Jeden globální strop napříč celou
    // partou by nechal třeba druhého rybáře vůbec
    // nezobrazeného, kdyby appka limit vyčerpala už na
    // seznamu prvního. ----------
    if (catchesSortMode === 'user') {
      const DEFAULT_USER_GROUP_LIMIT = 15
      const byUser = {}
      filtered.forEach((c) => {
        const uid = c.sessionRef.user_id
        ;(byUser[uid] = byUser[uid] || []).push(c)
      })
      const userIds = Object.keys(byUser).sort((a, b) => userName(a).localeCompare(userName(b)))
      return (
        <>
          {header}
          {userIds.map((uid) => {
            const list = byUser[uid].sort(byDate)
            const limit = userGroupLimits[uid] || DEFAULT_USER_GROUP_LIMIT
            const shown = list.slice(0, limit)
            return (
              <div key={uid}>
                <div className="month-header">
                  <span className="user-dot" style={{ background: userColor(uid), marginRight: 6 }} />
                  {userName(uid)} <span className="month-count">({list.length})</span>
                </div>
                {shown.map((c) => <CatchRow key={c.id} c={c} />)}
                {list.length > shown.length && (
                  <div style={{ padding: '10px 18px 16px', textAlign: 'center' }}>
                    <button className="new-btn" onClick={() => setUserGroupLimits((m) => ({ ...m, [uid]: limit + 20 }))}>
                      Zobrazit další ({list.length - shown.length} zbývá)
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )
    }

    // ---------- Podle druhu (výchozí): appka ukáže "poličku trofejí" --
    // malé čtvercové kartičky (jasně jen náhled, appka se nesnaží ukázat
    // celou fotku) -- klik na druh otevře jeho vlastní galerii, kde má
    // každá fotka konečně dost místa ukázat se celá, bez ořezu (viz
    // .polaroid-card níže). Předchozí řešení (jedna "hero" fotka na
    // pevnou nízkou výšku přes celou šířku) nutilo jednu fotku dělat dva
    // úkoly najednou (rychlý přehled i pořádné prohlížení) -- žádný
    // poměr stran to nemohl splnit dobře.
    const bySpecies = {}
    filtered.forEach((c) => {
      const key = (c.species || 'Neuvedeno').trim()
      ;(bySpecies[key] = bySpecies[key] || []).push(c)
    })
    const speciesNames = Object.keys(bySpecies).sort((a, b) => a.localeCompare(b, 'cs'))

    const openSpecies = speciesGalleryKey && bySpecies[speciesGalleryKey] ? speciesGalleryKey : null

    if (openSpecies) {
      const list = [...bySpecies[openSpecies]].sort((a, b) => (Number(b.length_cm) || 0) - (Number(a.length_cm) || 0))
      return (
        <>
          {header}
          <div className="species-gallery-head">
            <button className="new-btn" onClick={() => setSpeciesGalleryKey(null)}>← Zpět na druhy</button>
            <span className="species-gallery-title">{openSpecies} <span className="species-count">{list.length}×</span></span>
          </div>
          <div className="polaroid-grid">
            {list.map((c, i) => (
              <div key={c.id} className="polaroid-card" onClick={() => openCatch(c)}>
                <div className="polaroid-photo" style={{ background: c.photo_url ? undefined : CATEGORY_COLOR[c.category] }}>
                  {c.photo_url
                    ? <img src={c.photo_thumb_url || c.photo_url} alt={c.species} loading="lazy" />
                    : <div style={{ width: 60 }} dangerouslySetInnerHTML={{ __html: fishSVG('#fff') }} />}
                </div>
                <div className="polaroid-caption">
                  <span className="polaroid-length">{i === 0 && <IconTrophy size={12} color="var(--amber)" />} {c.length_cm ?? '—'} cm</span>
                  <span className="c-sub">{userName(c.sessionRef.user_id)} · {c.caught_at ? c.caught_at.slice(0, 10) : c.sessionRef.session_date}{c.revir ? ` · ${c.revir}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )
    }

    return (
      <>
        {header}
        <div className="species-shelf">
          {speciesNames.map((species) => {
            const list = bySpecies[species]
            const record = [...list].sort((a, b) => (Number(b.length_cm) || 0) - (Number(a.length_cm) || 0))[0]
            const catColor = CATEGORY_COLOR[record.category] || 'var(--paper-line)'
            return (
              <div key={species} className="species-shelf-card" onClick={() => setSpeciesGalleryKey(species)}>
                <div className="species-shelf-thumb" style={{ background: record.photo_url ? undefined : catColor }}>
                  {record.photo_url
                    ? <img src={record.photo_thumb_url || record.photo_url} alt={species} loading="lazy" />
                    : <div style={{ width: 34 }} dangerouslySetInnerHTML={{ __html: fishSVG('#fff') }} />}
                </div>
                <div className="species-shelf-name">{species}</div>
                <div className="species-shelf-sub">PR {record.length_cm ?? '—'} cm · {list.length}×</div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // appka tímhle počítá krátký přehled sezóny nad seznamem výprav -- kolik
  // úlovků bylo který týden a jestli šlo hlavně o dravce nebo bílou rybu.
  // appka záměrně bere úlovky (ne výpravy), protože ty lépe ukážou,
  // kdy se fakt dařilo, ne jen kdy appka byla u vody.
  function computeWeeklyActivity(list) {
    const year = new Date().getFullYear()
    const weeks = Array.from({ length: 52 }, () => ({ dravec: 0, bila: 0 }))
    const yearStart = new Date(year, 0, 1)
    list.forEach((s) => {
      ;(s.catches || []).forEach((c) => {
        const dateStr = c.caught_at ? c.caught_at.slice(0, 10) : s.session_date
        if (!dateStr) return
        const d = new Date(dateStr)
        if (d.getFullYear() !== year) return
        const idx = Math.min(51, Math.floor((d - yearStart) / 86400000 / 7))
        if (c.category === 'dravec') weeks[idx].dravec++
        else if (c.category === 'bila') weeks[idx].bila++
      })
    })
    return weeks
  }

  function renderSessionList() {
    return (
      <>
          <div className="sb-head" style={{ justifyContent: 'flex-end' }}>
            <button className="new-btn" onClick={startNewSession}>+ nová výprava</button>
          </div>
          <div style={{ padding: '0 18px 10px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', display: 'flex', pointerEvents: 'none' }}>
            <IconSearch size={15} />
          </span>
          <input
            className="text-input"
            style={{ paddingLeft: 34 }}
            placeholder="Hledat (název, revír, druh, nástraha)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
          <div className="sb-toolbar">
            <button className="new-btn" onClick={isAllExpanded(visibleSessions) ? collapseAll : expandAll}>
              {isAllExpanded(visibleSessions) ? 'Sbalit vše' : 'Rozbalit vše'}
            </button>
          </div>
          {(() => {
            const weeks = computeWeeklyActivity(visibleSessions)
            const maxTotal = Math.max(1, ...weeks.map((w) => w.dravec + w.bila))
            const seasonTotal = weeks.reduce((sum, w) => sum + w.dravec + w.bila, 0)
            return (
              <div className="season-chart-wrap">
                <div className="season-chart-label">
                  <span>Sezóna {new Date().getFullYear()} · úlovky po týdnech{seasonTotal > 0 ? ` · ${seasonTotal} celkem` : ''}</span>
                  <span className="season-chart-legend">
                    <span><i className="dot" style={{ background: 'var(--water-mid)' }} />Dravci</span>
                    <span><i className="dot" style={{ background: 'var(--amber)' }} />Bílá ryba</span>
                  </span>
                </div>
                <div className="season-chart">
                  {weeks.map((w, i) => {
                    const total = w.dravec + w.bila
                    if (total === 0) return <div key={i} className="season-chart-bar"><div className="season-chart-seg empty" /></div>
                    const dravecH = Math.round((w.dravec / maxTotal) * 60)
                    const bilaH = Math.round((w.bila / maxTotal) * 60)
                    return (
                      <div key={i} className="season-chart-bar" title={`Týden ${i + 1}: ${total} úlovky`}>
                        {w.bila > 0 && <div className="season-chart-seg bila" style={{ height: Math.max(2, bilaH) }} />}
                        {w.dravec > 0 && <div className="season-chart-seg dravec" style={{ height: Math.max(2, dravecH) }} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          <div className="filter-row">
            {['all', 'dravec', 'bila'].map((cat) => (
              <button
                key={cat}
                className={`filter-chip ${activeCategory === cat ? `active ${cat}` : ''}`}
                onClick={() => { setActiveCategory(cat); setViewMode('aggregate') }}
              >
                {cat === 'all' ? 'Vše' : cat === 'dravec' ? 'Dravci' : 'Bílá ryba'}
              </button>
            ))}
          </div>
          {members.length >= 1 && (
            <div className="filter-row">
              <button
                className={`filter-chip ${activeUserFilter === 'all' ? 'active' : ''}`}
                onClick={() => { setActiveUserFilter('all'); setViewMode('aggregate') }}
              >Kdo: Vše</button>
              {members.map((m) => (
                <button
                  key={m.id}
                  className={`filter-chip user-chip ${activeUserFilter === m.id ? 'active' : ''}`}
                  style={activeUserFilter === m.id ? { background: userColor(m.id), borderColor: userColor(m.id) } : {}}
                  onClick={() => { setActiveUserFilter(m.id); setViewMode('aggregate') }}
                >
                  <span className="user-dot" style={{ background: userColor(m.id) }} />
                  {m.name}{m.id === userId ? ' (já)' : ''}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="loader-text" style={{ padding: 18 }}>Načítám…</div>
          ) : visibleSessions.length === 0 ? (
            <div style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontSize: 13 }}>
              Žádná výprava. Zkus přidat první přes "+ nová výprava".
            </div>
          ) : (
            buildGroups(visibleSessions).map((yearGroup) => {
              const yearCollapsed = collapsedGroups.has(yearGroup.key)
              return (
                <div key={yearGroup.key}>
                  <div className="year-header" onClick={() => toggleGroup(yearGroup.key)}>
                    <span className="chevron">{yearCollapsed ? '▸' : '▾'}</span> {yearGroup.year}
                  </div>
                  {!yearCollapsed && yearGroup.months.map((m) => {
                    const monthCollapsed = collapsedGroups.has(m.key)
                    return (
                      <div key={m.key}>
                        <div className="month-header clickable" onClick={() => toggleGroup(m.key)}>
                          <span className="chevron">{monthCollapsed ? '▸' : '▾'}</span> {m.label} <span className="month-count">({m.sessions.length})</span>
                        </div>
                        {!monthCollapsed && m.sessions.map((s) => (
                          <div
                            key={s.id}
                            className={`session-item ${viewMode === 'detail' && s.id === activeId ? 'active' : ''} ${s.status === 'in_progress' ? 'live' : ''}`}
                            style={{ borderLeft: `3px solid ${userColor(s.user_id)}`, paddingLeft: 15 }}
                            onClick={() => { setActiveId(s.id); setViewMode('detail') }}
                          >
                            <div className="s-icon" dangerouslySetInnerHTML={{ __html: SESSION_TYPE_ICON[s.type] || iconSpin }} />
                            <div className="s-body">
                              <div className="s-title">{s.title}</div>
                              <div className="s-sub">
                                <IconMoonPhase phase={moonPhaseName(s.session_date)} size={11} /> {s.session_date} · {s.time_from}–{s.time_to} · {userName(s.user_id)}{s.revir ? ` · ${s.revir}` : ''}
                              </div>
                              <div className="s-tags">
                                {s.status === 'in_progress' && <span className="s-tag live-tag"><IconLive size={9} color="#fff" /> Probíhá</span>}
                                {TYPE_CATEGORY[s.type] && (
                                  <span className={`s-tag category-${TYPE_CATEGORY[s.type]}`}>{TYPE_CATEGORY[s.type] === 'dravec' ? 'Dravec' : 'Bílá ryba'}</span>
                                )}
                                {s.target_species && <span className="s-tag target"><IconTarget size={11} color="currentColor" /> {s.target_species}</span>}
                                <span className="s-tag catch">{filteredCatches(s).length} úlovky</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
      </>
    )
  }

  function renderDetailStrip() {
    return (
          activeSession && viewMode === 'detail' && !draftSession && (
            <div className="detail-strip">
              {activeSession.status === 'in_progress' && (
                <div className="live-banner" style={{ gridColumn: '1 / -1' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconLive size={14} /> Výprava právě probíhá</span>
                  {canEdit && <button className="new-btn" onClick={() => endLiveSession(activeSession)}>Ukončit výpravu</button>}
                </div>
              )}
              <div className="det-block">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <h3>Podmínky</h3>
                  <div style={{ position: 'relative' }} ref={sessionMenuRef}>
                    <button className="new-btn hamburger-btn" onClick={() => setShowSessionMenu((v) => !v)} title="Další možnosti">
                      <IconMenu size={16} color="var(--water-deep)" />
                    </button>
                    {showSessionMenu && (
                      <div className="type-picker" style={{ position: 'absolute', top: '100%', right: 0, left: 'auto', transform: 'none', marginTop: 6, minWidth: 200, paddingTop: 10, zIndex: 950 }}>
                        <button className="type-btn" onClick={() => { setShowSessionMenu(false); duplicateSession(activeSession) }}><IconDuplicate size={14} /> Nová jako tahle</button>
                        {canEdit && !LURE_TYPES.includes(activeSession.type) && (
                          <button className="type-btn" onClick={() => { setShowSessionMenu(false); startRelocateFromCard(activeSession) }}><IconRevir size={14} /> Přesunout bod</button>
                        )}
                        {canEdit && (
                          <button className="type-btn" onClick={() => { setShowSessionMenu(false); startEditSession(activeSession) }}><IconEdit size={14} /> Upravit výpravu</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'var(--fs-sm2)', color: 'var(--ink-soft)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconCalendar size={13} /> {activeSession.session_date}{activeSession.time_from ? ` · ${activeSession.time_from}–${activeSession.time_to || '?'}` : ''}
                  {crossesMidnight(activeSession.time_from, activeSession.time_to) && ` 🌙 (${formatDurationHM(sessionDurationMinutes(activeSession))})`}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)', marginTop: 2 }}>
                  Zapsal: {userName(activeSession.user_id)}
                </div>
                <div className="weather-row" style={{ marginTop: 8 }}>
                  <div className="w-item"><div className="num">{activeSession.weather_temp_c ?? '—'}°C</div><div className="lab">teplota</div></div>
                  <div className="w-item"><div className="num">{activeSession.weather_pressure_hpa ?? '—'} hPa <IconPressureTrend trend={activeSession.weather_pressure_trend} size={12} /></div><div className="lab">tlak</div></div>
                  <div className="w-item"><div className="num">{activeSession.weather_wind || '—'}</div><div className="lab">vítr</div></div>
                </div>
                {activeSession.water_stations?.length > 0 ? (
                  activeSession.water_stations.map((ws) => (
                    <div key={ws.station_id}>
                      <div className="weather-row" style={{ marginTop: 8 }}>
                        <div className="w-item"><div className="num"><IconDroplet size={13} color="var(--water-mid)" /> {ws.level_cm ?? '—'} cm</div><div className="lab">vodní stav</div></div>
                        <div className="w-item"><div className="num">{ws.flow_m3s ?? '—'} m³/s</div><div className="lab">průtok</div></div>
                        {ws.temp_c != null && <div className="w-item"><div className="num">{ws.temp_c}°C</div><div className="lab">teplota vody</div></div>}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                        {ws.station_name}{ws.precision ? ` · ${WATER_PRECISION_LABEL[ws.precision]}` : ''}
                        {ws.spa_level != null && SPA_LEVEL_INFO[ws.spa_level] && ` · ${SPA_LEVEL_INFO[ws.spa_level].icon} ${SPA_LEVEL_INFO[ws.spa_level].label}`}
                      </div>
                    </div>
                  ))
                ) : activeSession.water_station_name && (
                  <>
                    <div className="weather-row" style={{ marginTop: 8 }}>
                      <div className="w-item"><div className="num" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconDroplet size={13} color="var(--water-mid)" /> {activeSession.water_level_cm ?? '—'} cm</div><div className="lab">vodní stav</div></div>
                      <div className="w-item"><div className="num">{activeSession.water_flow_m3s ?? '—'} m³/s</div><div className="lab">průtok</div></div>
                      {activeSession.water_temp_c != null && <div className="w-item"><div className="num">{activeSession.water_temp_c}°C</div><div className="lab">teplota vody</div></div>}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ink-soft)' }}>
                      {activeSession.water_station_name}{activeSession.water_data_precision ? ` · ${WATER_PRECISION_LABEL[activeSession.water_data_precision]}` : ''}
                      {activeSession.water_spa_level != null && SPA_LEVEL_INFO[activeSession.water_spa_level] && ` · ${SPA_LEVEL_INFO[activeSession.water_spa_level].icon} ${SPA_LEVEL_INFO[activeSession.water_spa_level].label}`}
                    </div>
                  </>
                )}
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-soft)' }}>{activeSession.weather_desc}</div>
                <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(() => { const phase = moonPhaseName(activeSession.session_date); return <><IconMoonPhase phase={phase} size={14} /> {phase}</> })()}
                </div>
                <SessionMiniMap session={activeSession} userColor={userColor(activeSession.user_id)} onOpen={() => jumpToMapView(activeSession)} />
              </div>
              <div className="det-block">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3>{LURE_TYPES.includes(activeSession.type) ? 'Nástraha' : 'Pruty a nástrahy'}</h3>
                  {canEdit && !LURE_TYPES.includes(activeSession.type) && (
                    <button className="new-btn" onClick={() => startAddRodToSession(activeSession)}>+ Přidat prut</button>
                  )}
                  {canEdit && LURE_TYPES.includes(activeSession.type) && (!activeSession.rods || activeSession.rods.length === 0) && (
                    <button className="new-btn" onClick={() => addLureBaitToSession(activeSession)}>+ Přidat nástrahu</button>
                  )}
                </div>
                {(activeSession.rods || [])
                  .filter((r, i) => !LURE_TYPES.includes(activeSession.type) || i === 0)
                  .map((r, i) => (
                  editingRodId === r.id && canEdit ? (
                    <RodEditRow
                      key={r.id}
                      rod={r}
                      color={rodColors[i % rodColors.length]}
                      baitPhotoMap={baitPhotoLookup()}
                      baitListId={baitListId(activeSession.type)}
                      baitCatalog={mergedBaitOptions(baitCategoryFor(activeSession.type))}
                      baitCategory={baitCategoryFor(activeSession.type)}
                      onAddBait={addBaitToCatalog}
                      onBackfillBaitPhoto={backfillBaitPhoto}
                      onArmPosition={() => {
                        if (r.lat != null && r.lng != null) mapInstance.current?.setView([r.lat, r.lng], 19)
                        setPlacementTarget(`edit-rod-${r.id}`)
                      }}
                      onDone={() => { setEditingRodId(null); loadSessions() }}
                      onCancel={() => setEditingRodId(null)}
                      onDeleteRod={() => { setEditingRodId(null); loadSessions() }}
                      deleteLabel={LURE_TYPES.includes(activeSession.type) ? 'nástrahu' : 'prut'}
                      hidePosition={LURE_TYPES.includes(activeSession.type)}
                    />
                  ) : (
                    <div className="rod-row" key={r.id}>
                      {!LURE_TYPES.includes(activeSession.type) && <>
                        <div className="rod-dot" style={{ background: rodColors[i % rodColors.length] }} />
                        <div className="rod-name">{r.name}</div>
                      </>}
                      <div className="rod-baits">
                        {(r.baits && r.baits.length > 0 ? r.baits : (r.bait ? [{ name: r.bait, photo_url: r.bait_photo_url }] : [])).map((b, bi) => (
                          <span className="bait-chip" key={bi}>
                            {b.name}
                            {b.photo_url && <img src={b.photo_thumb_url || b.photo_url} alt="nástraha" className="bait-thumb" />}
                          </span>
                        ))}
                        {(!r.baits || r.baits.length === 0) && !r.bait && <span className="rod-bait">—</span>}
                      </div>
                      {canEdit && <button className="new-btn" onClick={() => setEditingRodId(r.id)}><IconEdit size={13} /></button>}
                    </div>
                  )
                ))}
                {!LURE_TYPES.includes(activeSession.type) && (!activeSession.rods || activeSession.rods.length === 0) && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Bez prutů</div>
                )}
                {!LURE_TYPES.includes(activeSession.type) && (
                  <div className="coord-list">
                    {(activeSession.rods || []).map((r) => (
                      <button key={r.id} className="coord-chip" type="button" onClick={() => jumpToMapView(activeSession, { lat: r.lat, lng: r.lng, zoom: 17 })}>
                        <IconRevir size={13} color="var(--water-mid)" dotColor="var(--paper)" /> {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {LURE_TYPES.includes(activeSession.type) && (
                <div className="det-block">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3>Místa</h3>
                    {canEdit && (
                      activeSession.status === 'in_progress' ? (
                        <button className="new-btn" onClick={() => addLurePlaceViaGps(activeSession)}>+ Další bod pomocí GPS</button>
                      ) : (
                        <button className="new-btn" onClick={() => startAddRodToSession(activeSession)}>+ Přidat další místo</button>
                      )
                    )}
                  </div>
                  <div className="coord-list">
                    {(activeSession.rods || []).map((r, i) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button className="coord-chip" type="button" style={{ flex: 1 }} onClick={() => jumpToMapView(activeSession, { lat: r.lat, lng: r.lng, zoom: 17 })}>
                          <IconRevir size={13} color="var(--water-mid)" dotColor="var(--paper)" /> Místo {i + 1}
                        </button>
                        {canEdit && (
                          <button className="new-btn" type="button" title="Přesunout" onClick={() => startRelocateLurePlace(activeSession, r)}><IconRevir size={13} /></button>
                        )}
                        {canEdit && i > 0 && (
                          <button className="ticket-close" style={{ position: 'static', color: 'var(--ink-soft)' }} onClick={() => deleteLurePlace(r)}><IconClose size={14} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  {(activeSession.rods || []).length <= 1 && (
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>Chytáš jen z jednoho místa. Pokud jsi zkoušel i jinde (např. jez z druhého břehu), přidej ho sem.</div>
                  )}
                </div>
              )}
              <div className="det-block">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3>Úlovky</h3>
                  {canEdit && <button className="new-btn" onClick={startAddCatch}>+ úlovek</button>}
                </div>
                <div className="catch-list">
                  {filteredCatches(activeSession).map((c) => {
                    const target = (activeSession.target_species || '').trim().toLowerCase()
                    const isGeneral = target.includes('obecně')
                    const matchesTarget = target && (isGeneral ? c.category === 'dravec' : c.species?.trim().toLowerCase() === target)
                    return (
                      <div className="catch-row" key={c.id} onClick={() => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) }}>
                        <div className="fish-mini" dangerouslySetInnerHTML={{ __html: fishSVG(CATEGORY_COLOR[c.category]) }} />
                        <div>
                          <div className="c-name">{c.species} {matchesTarget && <span title="Odpovídá cíli výpravy" style={{ display: 'inline-flex' }}><IconTarget size={12} color="var(--amber-deep)" /></span>}</div>
                          <div className="c-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {c.length_cm} cm · {c.weight_kg} kg {c.weight_kg != null && c.weight_estimated && <IconApprox size={12} />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {filteredCatches(activeSession).length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Žádný úlovek.</div>
                  )}
                </div>
              </div>
            </div>
          )
    )
  }

  return (
    <div className={`app${isDemoGroup ? ' demo-readonly' : ''}`}>
      <datalist id="known-baits-dravec">
        {allKnownBaits('dravec').map((b) => <option key={b} value={b} />)}
      </datalist>
      <datalist id="known-baits-bila">
        {allKnownBaits('bila').map((b) => <option key={b} value={b} />)}
      </datalist>
      <datalist id="known-baits-all">
        {allKnownBaits(null).map((b) => <option key={b} value={b} />)}
      </datalist>
      <datalist id="known-species">
        {allKnownSpecies().map((s) => <option key={s} value={s} />)}
      </datalist>
      <header>
        <div className="head-row">
          <div className="head-logo-group">
            <img src="/logo-horizontal.png" alt="Nahodit" className="app-logo-img" />
          </div>
          <div className="head-live-wrap">
            {myLiveSession ? (
              <button
                className="new-btn live-toggle active"
                onClick={() => { setActivePanel(null); setActiveId(myLiveSession.id); setViewMode('detail'); setMobileSheetOpen(true) }}
                title="Rozjetá výprava"
              ><IconLive size={11} color="#fff" /> Probíhá</button>
            ) : (
              <button className="new-btn live-toggle" onClick={startNewSessionLive} title="Spustit živou výpravu">Chytám</button>
            )}
          </div>
          <div className="head-icons-group">
            <div style={{ position: 'relative' }} ref={notificationsRef}>
              <button
                className="new-btn hamburger-btn notif-bell-btn"
                onClick={() => (showNotifications ? closeNotifications() : openNotifications())}
                title="Novinky"
              >
                <IconBell size={18} color="var(--water-deep)" />
                {computeNotifications().length > 0 && (
                  <span className="notif-badge">{computeNotifications().length}</span>
                )}
              </button>
              {showNotifications && (() => {
                const items = computeNotifications()
                return (
                  <div className="type-picker" style={{ position: 'absolute', top: '100%', right: 0, left: 'auto', transform: 'none', marginTop: 6, minWidth: 260, maxWidth: 320, zIndex: 950 }}>
                    <div className="type-picker-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>Novinky</span>
                      <button type="button" onClick={closeNotifications} style={{ background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', display: 'flex', padding: 0 }}><IconClose size={14} /></button>
                    </div>
                    {items.length === 0 ? (
                      <p className="hint-text" style={{ margin: 0 }}>Zatím žádné novinky.</p>
                    ) : (
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {items.map((item) => {
                          if (item.type === 'session') {
                            return (
                              <div className="notif-item" key={item.key}>
                                <div className="notif-item-title" onClick={async () => { await closeNotifications(); setActiveId(item.session.id); setViewMode('detail') }}>
                                  <IconVyprava size={13} color="var(--water-deep)" /> Nová výprava: {item.session.title}
                                </div>
                                <div className="notif-item-sub">{userName(item.session.user_id)} · {item.session.session_date}</div>
                              </div>
                            )
                          }
                          if (item.type === 'catch') {
                            return (
                              <div className="notif-item" key={item.key}>
                                <div className="notif-item-title" onClick={async () => { await closeNotifications(); setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(item.catchData) }}>
                                  <IconUlovek size={13} color="var(--water-deep)" /> Nový úlovek: {item.catchData.species}
                                </div>
                                <div className="notif-item-sub">{userName(item.session.user_id)} · {item.session.title}</div>
                              </div>
                            )
                          }
                          // type === 'location'
                          return (
                            <div className="notif-item" key={item.key}>
                              <div className="notif-item-title" style={{ cursor: 'default' }}>
                                <IconRevir size={13} color="var(--water-deep)" dotColor="var(--paper)" /> Revír „{item.location.name}" byl upraven
                              </div>
                              <div className="notif-item-sub">
                                Ovlivňuje {item.mySessions.length} {item.mySessions.length === 1 ? 'tvou výpravu' : item.mySessions.length < 5 ? 'tvé výpravy' : 'tvých výprav'}.
                              </div>
                              <button className="new-btn" style={{ marginTop: 6 }} onClick={() => confirmLocationNotificationUpdate(item)}>Potvrdit a aktualizovat</button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <div style={{ position: 'relative' }} ref={moreMenuRef}>
              <button className="new-btn hamburger-btn" onClick={() => setShowMoreMenu((v) => !v)} title="Více">
                <IconMenu size={19} color="var(--water-deep)" />
              </button>
              {showMoreMenu && (
                <div className="type-picker" style={{ position: 'absolute', top: '100%', right: 0, left: 'auto', transform: 'none', marginTop: 6, minWidth: 190, zIndex: 950 }}>
                  <div className="type-picker-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>{myProfile?.display_name}</span>
                    <button type="button" onClick={() => setShowMoreMenu(false)} style={{ background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', display: 'flex', padding: 0 }}><IconClose size={14} /></button>
                  </div>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); createInvite() }}>+ pozvat parťáka</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); onSignOut() }}>Odhlásit</button>
                  <div style={{ height: 1, background: 'var(--paper-line)', margin: '6px 0' }} />
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); switchPanel('baits') }}><IconNastraha size={15} color="var(--water-deep)" /> Nástrahy</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); switchPanel('stations') }}><IconDroplet size={15} color="var(--water-deep)" /> Měrné stanice</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); switchPanel('records') }}><IconTrophy size={15} color="var(--amber)" /> Rekordy</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); switchPanel('stats') }}><IconChart size={15} color="var(--water-deep)" /> Statistiky</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); exportData() }}><IconDownload size={15} color="var(--water-deep)" /> Export dat</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); switchPanel('help') }}><IconHelp size={15} color="var(--water-deep)" /> Návod</button>
                  <button className="type-btn" onClick={() => { setShowMoreMenu(false); switchPanel('settings') }}><IconSettings size={15} color="var(--water-deep)" /> Nastavení</button>
              </div>
            )}
          </div>
          </div>
        </div>
        <div className="head-secondary-row">
          <div className="head-actions-primary">
            {renderTabButtons()}
          </div>
        </div>
        {inviteInfo && (
          <div className="invite-banner">
            Kód pro kamaráda: <strong>{inviteInfo.code}</strong> (platný 7 dní) — ať ho zadá po přihlášení do appky na obrazovce "Mám kód pozvánky".
            <button className="ticket-close" onClick={() => setInviteInfo(null)}><IconClose size={16} /></button>
          </div>
        )}
        {!isOnline && (
          <div className="offline-banner" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconOffline size={15} /> Nejsi připojený k internetu — rozepsaná data zůstávají vyplněná, zkus uložit až se signál vrátí.</div>
        )}
        {isDemoGroup && (
          <div className="demo-banner">🔒 Prohlížíš demo appku -- je jen pro čtení, nic se v ní neuloží.</div>
        )}
      </header>

      <div className={`layout ${
        (activePanel === 'home' || activePanel === 'stations' || activePanel === 'catches' || activePanel === 'baits' ||
          activePanel === 'records' || activePanel === 'stats' || activePanel === 'help' || activePanel === 'settings') && !mapNeededForInteraction ? 'no-map'
        : activePanel === null && !mapNeededForInteraction ? 'no-map-keep-detail'
        : ''
      }`}>
        <aside className="sidebar" ref={sidebarRef}>
          {activePanel === 'home' ? renderHomeFeed()
            : activePanel === 'stations' ? renderStationsPanel()
            : activePanel === 'map' ? renderMapControls()
            : activePanel === 'locations' ? renderLocationsList()
            : activePanel === 'baits' ? renderBaitsList()
            : activePanel === 'catches' ? renderCatchesList()
            : activePanel === 'records' ? <RecordsModal sessions={sessions} userName={userName} userColor={userColor} onOpenCatch={(c) => { setBaitsInitialKey(null); setLocationsReturnId(null); setTicketCatch(c) }} />
            : activePanel === 'stats' ? <StatsModal sessions={sessions} members={members} userColor={userColor} statsSince={groupInfo?.stats_since || groupInfo?.created_at} />
            : activePanel === 'help' ? <HelpModal />
            : activePanel === 'settings' ? <SettingsModal userId={userId} profile={myProfile} groupId={groupId} groupInfo={groupInfo} onSaved={(updated) => { setMyProfile(updated); loadMembers() }} onGroupSaved={(g) => setGroupInfo(g)} />
            : renderSessionList()}
        </aside>


        <main>
          <div ref={mapRef} id="map" style={{ cursor: isPlacingSomething ? 'crosshair' : '', display: activePanel === 'map' ? 'none' : undefined }} />
          <div ref={mapTabRef} id="map-tab-view" style={{ display: activePanel === 'map' ? 'block' : 'none' }} />
          <button className="my-location-btn" onClick={goToMyLocation} title="Moje pozice"><IconLocate size={15} /><span className="btn-label"> Moje pozice</span></button>

          {pickingType && (
            <div className="type-picker">
              <div className="type-picker-title">Jaký typ výpravy?</div>
              {SESSION_TYPES.map((t) => (
                <button key={t.value} className="type-btn" onClick={() => chooseType(t.value)}>{t.label}</button>
              ))}
              <button className="type-cancel" onClick={() => setPickingType(false)}>Zrušit</button>
            </div>
          )}

          {locationPickerStep === 'choose' && (
            <div className="type-picker">
              <div className="type-picker-title">Jak zadat místo?</div>
              <button className="type-btn" onClick={() => setLocationPickerStep('catalog')}><IconRevir size={14} /> Z katalogu</button>
              <button className="type-btn" onClick={startDrawNew}><IconEdit size={13} /> Naklikat nové na mapě</button>
              <button className="type-cancel" onClick={() => setLocationPickerStep(null)}>Zrušit</button>
            </div>
          )}

          {gpsCapturing && (
            <div className="place-hint area-hint">
              Zjišťuji tvoji polohu…
              <div className="area-controls">
                <button className="new-btn" onClick={startManualShorePointPlacement}>Umístit ručně místo GPS</button>
                <button className="new-btn" onClick={() => { gpsRequestIdRef.current++; setGpsCapturing(false) }}>Zrušit</button>
              </div>
            </div>
          )}

          {placementTarget === 'shore-point-click' && (
            <div className="place-hint">
              Klikni na mapu, kde jsi stál na břehu.
              <button className="ticket-close" onClick={() => setPlacementTarget(null)}><IconClose size={16} /></button>
            </div>
          )}

          {gpsConfirmStep && (
            <div className="type-picker" style={{ minWidth: 250 }}>
              <div className="type-picker-title">Jak se tohle místo jmenuje?</div>
              {gpsConfirmStep.matches.length > 0 && (
                <>
                  <p className="hint-text" style={{ margin: '0 0 6px' }}>Appka našla poblíž:</p>
                  {gpsConfirmStep.matches.map((m, i) => (
                    <button key={i} className="type-btn" onClick={() => pickGpsMatch(m)}>
                      {m.title}{m.revir ? ` (${m.revir})` : ''} <span style={{ opacity: .6, marginLeft: 4 }}>· {m.distance === 0 ? 'jsi uvnitř' : `${Math.round(m.distance)} m`}</span>
                    </button>
                  ))}
                  <div style={{ height: 1, background: 'var(--paper-line)', margin: '8px 0' }} />
                </>
              )}
              <label className="field-label" style={{ marginTop: 0 }}>Nebo napiš nové jméno</label>
              <input className="text-input" placeholder="např. Jizera - most" value={gpsManualTitle} onChange={(e) => setGpsManualTitle(e.target.value)} />
              <label className="field-label">Revír (nepovinné)</label>
              <input className="text-input" placeholder="např. 411024" value={gpsManualRevir} onChange={(e) => setGpsManualRevir(e.target.value)} />
              <button className="btn-primary" style={{ marginTop: 10 }} onClick={confirmGpsManual} disabled={!gpsManualTitle.trim()}>Pokračovat</button>
              <button className="type-cancel" onClick={cancelGpsFlow}>Zrušit</button>
            </div>
          )}

          {addAreaStep === 'choose' && (
            <div className="type-picker" style={{ zIndex: 700 }}>
              <div className="type-picker-title">Jak přidat oblast?</div>
              <button className="type-btn" onClick={() => setAddAreaStep('catalog')}><IconRevir size={14} /> Z katalogu</button>
              <button className="type-btn" onClick={startAddAreaManualFromChoice}><IconEdit size={13} /> Naklikat novou na mapě</button>
              <button className="type-btn" onClick={startAddAreaRiverFromChoice}><IconRiverAuto size={14} /> Podle břehu (auto)</button>
              <button className="type-cancel" onClick={() => { setAddAreaStep(null); pendingAreaAppendRef.current = null }}>Zrušit</button>
            </div>
          )}

          {areaDrawChoice && (
            <div className="type-picker" style={{ zIndex: 700 }}>
              <div className="type-picker-title">Jak nakreslit oblast?</div>
              <button className="type-btn" onClick={chooseManualDrawing}><IconEdit size={13} /> Naklikat ručně</button>
              <button className="type-btn" onClick={chooseRiverDrawing}><IconRiverAuto size={14} /> Podle břehu (auto)</button>
              <button className="type-cancel" onClick={cancelAreaDrawChoice}>Zrušit</button>
            </div>
          )}

          {riverLineDraft && (
            <div className="place-hint area-hint" style={{ maxWidth: 'min(280px, 88vw)', zIndex: 700 }}>
              {!riverConfirm ? (
                <>
                  Klikej body středem toku ({riverLineDraft.points.length} {riverLineDraft.points.length === 1 ? 'bod' : 'body'}, potřeba aspoň 2).
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '8px 0 4px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 2, color: 'rgba(255,255,255,.75)' }}>
                      Koridor (m)
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <button type="button" className="stepper-btn" onClick={() => stepRiverCorridorWidth(-10)}>−</button>
                        <input
                          type="number" className="text-input" style={{ width: 52, padding: '5px 4px', textAlign: 'center' }}
                          value={riverCorridorWidth}
                          onChange={(e) => setRiverCorridorWidth(e.target.value)}
                          onBlur={() => setRiverCorridorWidth((v) => (v === '' || Number.isNaN(Number(v)) || Number(v) <= 0) ? 80 : Number(v))}
                        />
                        <button type="button" className="stepper-btn" onClick={() => stepRiverCorridorWidth(10)}>+</button>
                      </div>
                    </label>
                    <label style={{ fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 2, color: 'rgba(255,255,255,.75)' }}>
                      Přesah (m)
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <button type="button" className="stepper-btn" onClick={() => stepRiverOvershoot(-5)}>−</button>
                        <input
                          type="number" className="text-input" style={{ width: 52, padding: '5px 4px', textAlign: 'center' }}
                          value={riverOvershoot}
                          onChange={(e) => setRiverOvershoot(e.target.value)}
                          onBlur={() => setRiverOvershoot((v) => (v === '' || Number.isNaN(Number(v)) || Number(v) < 0) ? 0 : Number(v))}
                        />
                        <button type="button" className="stepper-btn" onClick={() => stepRiverOvershoot(5)}>+</button>
                      </div>
                    </label>
                  </div>
                  {riverSnapAvailable && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, margin: '4px 0', cursor: 'pointer', color: 'rgba(255,255,255,.9)' }}>
                        <input type="checkbox" checked={riverSnapEnabled} onChange={(e) => setRiverSnapEnabled(e.target.checked)} />
                        Navázat přesně na: {snapSourceLabel || 'předchozí úsek'}
                      </label>
                    </>
                  )}
                  {!riverBusy && locationsCatalog.some((l) => l.edge_cuts && (l.edge_cuts.start || l.edge_cuts.end)) && (
                    <button
                      type="button" className="new-btn" style={{ margin: '2px 0 4px', width: '100%', justifyContent: 'center', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}
                      onClick={() => setShowCatalogSnapPicker((v) => !v)}
                    >{showCatalogSnapPicker ? 'Zavřít výběr revíru' : 'Navázat na revír z katalogu'}</button>
                  )}
                  {showCatalogSnapPicker && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', background: 'rgba(0,0,0,.15)', borderRadius: 8, padding: 6, margin: '0 0 6px' }}>
                      {locationsCatalog
                        .flatMap((l) => ['start', 'end']
                          .filter((which) => l.edge_cuts?.[which])
                          .map((which) => ({
                            location: l,
                            which,
                            distance: riverLineDraft.points[0]
                              ? roughDistanceMeters(riverLineDraft.points[0], l.edge_cuts[which].cutPoint)
                              : null,
                          })))
                        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
                        .map(({ location: l, which, distance }) => (
                          <div key={`${l.id}-${which}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11.5, color: '#fff' }}>
                            <span style={{ flex: 1, textAlign: 'left' }}>
                              {l.name} — <strong>{which === 'start' ? 'Začátek' : 'Konec'}</strong>
                              {distance != null && <span style={{ opacity: .6 }}> ({Math.round(distance)} m)</span>}
                            </span>
                            <button type="button" className="new-btn" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} onClick={() => pickCatalogSnap(l, which)}>Navázat</button>
                          </div>
                        ))}
                    </div>
                  )}
                  {riverBusy && <p className="hint-text" style={{ margin: '4px 0', fontSize: 11.5 }}>Zjišťuji tvar vody z OSM dat…</p>}
                  {riverError && <p className="hint-text" style={{ margin: '4px 0', fontSize: 11.5, color: '#B4432E', fontWeight: 600 }}>{riverError}</p>}
                  <div className="area-controls">
                    <button className="new-btn" onClick={undoRiverLinePoint} disabled={!riverLineDraft.points.length || riverBusy}>Zpět o bod</button>
                    <button
                      className="btn-primary" style={{ margin: 0 }}
                      onClick={generateRiverArea}
                      disabled={riverLineDraft.points.length < 2 || riverBusy}
                    >{riverBusy ? 'Generuji…' : 'Vygenerovat'}</button>
                    <button className="new-btn" onClick={cancelRiverLine}>Zrušit</button>
                  </div>
                </>
              ) : (
                <>
                  Vypadá to dobře? Vygenerováno {riverConfirm.polygons.length} {riverConfirm.polygons.length === 1 ? 'plocha' : 'plochy'} — vykreslené na mapě.
                  {riverConfirm.usedSnap && (
                    <p className="hint-text" style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 600 }}>
                      ✓ Navázáno přesně na: {riverConfirm.usedSnapLabel} — bez mezery, stejný sklon řezu.
                    </p>
                  )}
                  {riverConfirm.snapSkippedReason && (
                    <p className="hint-text" style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 600, color: '#B4432E' }}>
                      ⚠ {riverConfirm.snapSkippedReason}
                    </p>
                  )}
                  <div className="area-controls">
                    <button className="btn-primary" style={{ margin: 0 }} onClick={confirmRiverArea}>Použít</button>
                    <button className="new-btn" onClick={retryRiverGeneration}>Zkusit znovu</button>
                    <button className="new-btn" onClick={cancelRiverLine}>Zrušit</button>
                  </div>
                </>
              )}
            </div>
          )}

          {addAreaStep === 'catalog' && (
            <div className="type-picker" style={{ minWidth: 260, zIndex: 700 }}>
              <div className="type-picker-title">Vyber místa z katalogu</div>
              {locationsCatalog.filter((l) => l.area).length === 0 && <p className="hint-text">Katalog zatím nemá žádnou vyšrafovanou oblast.</p>}
              <div className="location-checklist">
                {locationsCatalog.filter((l) => l.area).map((loc) => (
                  <label key={loc.id} className="location-check-row">
                    <input type="checkbox" checked={addAreaCatalogIds.includes(loc.id)} onChange={() => toggleAddAreaCatalogId(loc.id)} />
                    <span>{loc.name}{loc.revir ? ` (${loc.revir})` : ''}</span>
                  </label>
                ))}
              </div>
              <button className="btn-primary" style={{ margin: '8px 0 0', width: '100%' }} onClick={proceedAddAreaFromCatalog} disabled={addAreaCatalogIds.length === 0}>Přidat</button>
              <button className="new-btn" style={{ marginTop: 6 }} onClick={() => setAddAreaStep('choose')}>← Zpět</button>
              <button className="type-cancel" onClick={() => { setAddAreaStep(null); setAddAreaCatalogIds([]); pendingAreaAppendRef.current = null }}>Zrušit</button>
            </div>
          )}

          {locationActionMenuFor && (
            <div className="type-picker">
              <div className="type-picker-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><IconRevir size={16} color="#fff" /> Místo výpravy</div>
              <button
                className="type-btn"
                onClick={() => { const s = locationActionMenuFor; setLocationActionMenuFor(null); updateSessionFromLocations(s) }}
              ><IconRefresh size={13} /> Aktualizovat podle katalogu</button>
              <button
                className="type-btn"
                onClick={() => { const s = locationActionMenuFor; setLocationActionMenuFor(null); startAttachLocationsToSession(s) }}
              >+ Přidat/změnit místa</button>
              <button className="type-cancel" onClick={() => setLocationActionMenuFor(null)}>Zrušit</button>
            </div>
          )}

          {locationPickerStep === 'attach' && (
            <div className="type-picker" style={{ minWidth: 260 }}>
              <div className="type-picker-title">Vyber místa z katalogu</div>
              {locationsCatalog.length === 0 && <p className="hint-text">Katalog je zatím prázdný.</p>}
              <div className="location-checklist">
                {locationsCatalog.map((loc) => (
                  <label key={loc.id} className="location-check-row">
                    <input type="checkbox" checked={pickingCatalogIds.includes(loc.id)} onChange={() => togglePickingCatalogId(loc.id)} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconRevir size={13} color="var(--water-deep)" /> {loc.name}{loc.revir ? ` (${loc.revir})` : ''}</span>
                  </label>
                ))}
              </div>
              <button className="btn-primary" style={{ margin: '8px 0 0', width: '100%' }} onClick={proceedAttachLocations} disabled={pickingCatalogIds.length === 0}>Uložit výběr</button>
              <button
                className="type-cancel"
                onClick={() => { setLocationPickerStep(null); setPickingCatalogIds([]); setAttachingLocationsSessionId(null) }}
              >Zrušit</button>
            </div>
          )}

          {locationPickerStep === 'catalog' && (
            <div className="type-picker" style={{ minWidth: 260 }}>
              <div className="type-picker-title">Vyber místa z katalogu</div>
              {locationsCatalog.length === 0 && <p className="hint-text">Katalog je zatím prázdný.</p>}
              <div className="location-checklist">
                {locationsCatalog.map((loc) => (
                  <label key={loc.id} className="location-check-row">
                    <input type="checkbox" checked={pickingCatalogIds.includes(loc.id)} onChange={() => togglePickingCatalogId(loc.id)} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconRevir size={13} color="var(--water-deep)" /> {loc.name}{loc.revir ? ` (${loc.revir})` : ''}</span>
                  </label>
                ))}
              </div>
              <button className="btn-primary" style={{ margin: '8px 0 0', width: '100%' }} onClick={proceedFromCatalogSelection} disabled={pickingCatalogIds.length === 0}>Pokračovat</button>
              <button className="new-btn" style={{ marginTop: 6 }} onClick={() => setLocationPickerStep('choose')}>← Zpět</button>
              <button className="type-cancel" onClick={() => { setLocationPickerStep(null); setPickingCatalogIds([]) }}>Zrušit</button>
            </div>
          )}

          {editingAreasSession && !areaDraft && (
            <div className="type-picker" style={{ minWidth: 260 }}>
              <div className="type-picker-title">Oblasti výpravy ({editingAreasSession.areas.length})</div>
              {editingAreasSession.areas.map((entry, idx) => {
                const loc = entry.location_id ? locationsCatalog.find((l) => l.id === entry.location_id) : null
                return (
                  <div key={idx} className="rod-edit-row" style={{ marginBottom: 4 }}>
                    <span className="hint-text" style={{ margin: 0, flex: 1 }}>{loc ? loc.name : `Oblast ${idx + 1}`} ({entry.points.length} bodů)</span>
                    <button className="new-btn danger-btn" onClick={() => removeManagedArea(idx)}><IconTrash size={13} /></button>
                  </div>
                )
              })}
              {editingAreasSession.areas.length === 0 && (
                <p className="hint-text">Žádná oblast — přidej aspoň jednu, nebo zruš úpravu.</p>
              )}
              <button className="new-btn" onClick={() => startAddAreaPoint((newAreas) => addAreasToManaged(newAreas), true)} style={{ marginTop: 6 }}>+ Přidat oblast</button>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="new-btn" onClick={() => setEditingAreasSession(null)}>Zrušit</button>
                <button className="btn-primary" style={{ margin: 0 }} onClick={saveManagedAreas} disabled={editingAreasSession.areas.length === 0}>Uložit</button>
              </div>
            </div>
          )}

          {editingAreasLocation && !areaDraft && (
            <div className="type-picker" style={{ minWidth: 260 }}>
              <div className="type-picker-title">Oblasti místa ({editingAreasLocation.areas.length})</div>
              {editingAreasLocation.areas.map((pts, idx) => (
                <div key={idx} className="rod-edit-row" style={{ marginBottom: 4 }}>
                  <span className="hint-text" style={{ margin: 0, flex: 1 }}>Oblast {idx + 1} ({pts.length} bodů)</span>
                  <button className="new-btn danger-btn" onClick={() => removeManagedLocationArea(idx)}><IconTrash size={13} /></button>
                </div>
              ))}
              {editingAreasLocation.areas.length === 0 && (
                <p className="hint-text">Žádná oblast — přidej aspoň jednu, nebo zruš úpravu.</p>
              )}
              <button className="new-btn" onClick={() => startAddAreaPoint((newAreas) => addAreasToManagedLocation(newAreas))} style={{ marginTop: 6 }}>+ Přidat oblast</button>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="new-btn" onClick={() => { setEditingAreasLocation(null); resetRiverSnapMemory(); setShowLocations(true) }}>Zrušit</button>
                <button className="btn-primary" style={{ margin: 0 }} onClick={saveManagedLocationAreas} disabled={editingAreasLocation.areas.length === 0}>Uložit</button>
              </div>
            </div>
          )}

          {catchChoosing && activeSession && (
            <div className="type-picker">
              <div className="type-picker-title">Kde jsi rybu chytil?</div>
              {(activeSession.rods || []).map((r) => (
                <button key={r.id} className="type-btn" onClick={() => chooseCatchOnRod(r)}>
                  Na pozici: {r.name}{r.bait ? ` (${r.bait})` : ''}
                </button>
              ))}
              <button className="type-btn" onClick={chooseCatchOnMap}><IconRevir size={14} /> Kliknout na jinou pozici mapy</button>
              <button className="type-cancel" onClick={() => setCatchChoosing(false)}>Zrušit</button>
            </div>
          )}

          {placementTarget === 'relocate-session-point' && (
            <div className="place-hint">
              Klikni na mapu, kam přesunout výpravu.
              <button className="ticket-close" onClick={() => setPlacementTarget(null)}><IconClose size={16} /></button>
            </div>
          )}

          {placementTarget === 'add-rod-to-session' && (
            <div className="place-hint">
              Klikni na mapu pro pozici {LURE_TYPES.includes(addRodToSessionRef.current?.type) ? 'nového místa' : 'nového prutu'}.
              <button className="ticket-close" onClick={() => { setPlacementTarget(null); addRodToSessionRef.current = null }}><IconClose size={16} /></button>
            </div>
          )}

          {placementTarget === 'new-location-point' && (
            <div className="place-hint">
              Klikni na mapu — orientační bod pro nové místo.
              <button className="ticket-close" onClick={() => setPlacementTarget(null)}><IconClose size={16} /></button>
            </div>
          )}

          {rodPointsDraft && (() => {
            const isLure = LURE_TYPES.includes(pendingTypeRef.current)
            const label = isLure ? 'Místo' : 'Prut'
            return (
              <div className="place-hint area-hint">
                {pendingGpsShorePointRef.current && !isLure && (
                  <div style={{ marginBottom: 4, opacity: .85 }}>📍 Bod na břehu nastaven — appka podle něj najde revír a vodní stav.</div>
                )}
                Klikni na mapu, kam jsi {isLure ? 'šel dál' : 'nahodil'} {label} {rodPointsDraft.length + 1}{rodPointsDraft.length > 0 ? ` (zatím nastaveno: ${rodPointsDraft.length})` : ''}.
                <div className="area-controls">
                  <button className="new-btn" onClick={undoRodPoint} disabled={!rodPointsDraft.length}>Zpět o {isLure ? 'místo' : 'prut'}</button>
                  <button className="btn-primary" style={{ margin: 0 }} onClick={finishRodPoints} disabled={!rodPointsDraft.length}>Hotovo, pokračovat</button>
                  <button className="new-btn" onClick={cancelAreaOrPoint}>Zrušit</button>
                </div>
              </div>
            )
          })()}

          {(placementTarget === 'catch-point' || placementTarget === 'relocate-catch') && (
            <div className="place-hint">
              {placementTarget === 'relocate-catch' ? 'Klikni na mapu, kam přesunout úlovek.' : 'Klikni na mapu, kde jsi rybu chytil.'}
              <button className="ticket-close" onClick={() => setPlacementTarget(null)}><IconClose size={16} /></button>
            </div>
          )}

          {areaDraft && !autoAdvancingArea && (
            <div className="place-hint area-hint">
              Klikej podél trasy/oblasti ({areaDraft.current.length} bodů v aktuální, potřeba aspoň 3){areaDraft.areas.length > 0 ? ` · hotových oblastí: ${areaDraft.areas.length}` : ''}.
              <div className="area-controls">
                <button className="new-btn" onClick={undoAreaPoint} disabled={!areaDraft.current.length}>Zpět o bod</button>
                <button className="new-btn" onClick={finishCurrentArea} disabled={areaDraft.current.length < 3}>+ Další oblast</button>
                <button
                  className="btn-primary" style={{ margin: 0 }}
                  onClick={placementTarget === 'relocate-area-point' ? proceedRelocateArea : placementTarget === 'area-point-append' ? finishAppendArea : proceedToForm}
                  disabled={areaDraft.areas.length === 0 && areaDraft.current.length < 3}
                >
                  {placementTarget === 'relocate-area-point' ? 'Uložit novou oblast' : placementTarget === 'area-point-append' ? 'Přidat oblast(i)' : 'Hotovo, pokračovat'}
                </button>
                <button className="new-btn" onClick={placementTarget === 'area-point-append' ? () => { setAreaDraft(null); setPlacementTarget(null); pendingAreaAppendRef.current = null } : cancelAreaOrPoint}>Zrušit</button>
              </div>
            </div>
          )}

          {placementTarget && (placementTarget.startsWith('rod-') || placementTarget.startsWith('edit-rod-') || placementTarget.startsWith('relocate-lure-place-')) && (
            <div className="place-hint">
              Klikni na mapu pro pozici {LURE_TYPES.includes(editingSession?.type || draftSession?.type || activeSession?.type) ? 'místa' : 'prutu'}.
              <button className="ticket-close" onClick={() => setPlacementTarget(null)}><IconClose size={16} /></button>
            </div>
          )}

          <div className="desktop-detail-wrap">
            {activePanel === null && !mapNeededForInteraction && (
              renderDetailStrip() || (
                <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 'var(--fs-sm2)' }}>
                  Vyber výpravu ze seznamu vlevo.
                </div>
              )
            )}
          </div>
        </main>

        {activePanel !== 'home' && activePanel !== 'stations' && activePanel !== 'catches' && activePanel !== 'baits' &&
          activePanel !== 'records' && activePanel !== 'stats' && activePanel !== 'help' && activePanel !== 'settings' && (
          <div ref={mobileSheetRef} className={`mobile-sheet ${mobileSheetOpen ? 'expanded' : ''} ${activePanel === 'map' ? 'map-panel' : ''} ${mobileFullPanel ? 'full-panel' : ''}`}>
            {!mobileFullPanel && (
              <div className="mobile-peek-bar" onClick={() => setMobileSheetOpen((v) => !v)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{peekLabel()}</span>
                <span className="peek-chevron">{mobileSheetOpen ? '▾' : '▴'}</span>
              </div>
            )}
            <div className="mobile-sheet-body" ref={mobileSheetBodyRef}>
              {activePanel === 'map' ? renderMapControls()
                : activePanel === 'locations' ? renderLocationsList()
                : (
                  viewMode === 'detail' && activeSession && !draftSession ? (
                    <>
                      <button className="new-btn" onClick={() => setViewMode('aggregate')} style={{ margin: '0 18px 8px' }}>← Zpět na seznam</button>
                      {renderDetailStrip()}
                    </>
                  ) : renderSessionList()
                )}
            </div>
          </div>
        )}
      </div>

      {/* Spodní navigační lišta appka ukazuje jen v appce nainstalované na
          plochu (CSS řeší .bottom-tab-bar -- jinde display:none). Musí být
          tady, AŽ ZA .layout, ne uvnitř <header> jako horní verze --
          "position:sticky" se počítá vždy vůči svému vlastnímu
          rodiči v DOM, ne vůči celé stránce, takže potřebuje sáhnout přes
          celou zbývající výšku appky, ne jen přes krátkou hlavičku. */}
      <nav className="bottom-tab-bar">
        {renderTabButtons()}
      </nav>

      {draftSession && !(placementTarget && placementTarget.startsWith('rod-')) && (
        <SessionFormPanel
          draft={draftSession}
          setDraft={setDraftSession}
          onArmRod={(i) => setPlacementTarget(`rod-${i}`)}
          onSave={saveSession}
          onClose={() => setDraftSession(null)}
          baitPhotoMap={baitPhotoLookup()}
          baitListId={baitListId(draftSession.type)}
          baitCatalog={mergedBaitOptions(baitCategoryFor(draftSession.type))}
          baitCategory={baitCategoryFor(draftSession.type)}
          onAddBait={addBaitToCatalog}
          onStartAddArea={startAddAreaPoint}
          locationsCatalog={locationsCatalog}
          onSaveLocation={startSaveLocation}
          onPersistStation={persistStationChoice}
          onZoomToPoint={(lat, lng) => mapInstance.current?.setView([lat, lng], 15)}
        />
      )}

      {draftCatch && activeSession && (
        <CatchFormPanel
          draft={draftCatch}
          setDraft={setDraftCatch}
          rods={activeSession.rods || []}
          session={activeSession}
          onSave={saveCatch}
          onClose={() => setDraftCatch(null)}
          baitPhotoMap={baitPhotoLookup()}
          baitListId={baitListId(activeSession.type)}
          baitCatalog={sessionBaitOptions(activeSession)}
          baitCategory={baitCategoryFor(activeSession.type)}
          onAddBait={addBaitToCatalog}
          locationsCatalog={locationsCatalog}
        />
      )}

      {savingLocationFor && (
        <SaveLocationForm
          source={savingLocationFor}
          onCancel={() => { setSavingLocationFor(null); resetRiverSnapMemory() }}
          onSave={saveLocationToCatalog}
        />
      )}

      {showBaits && (
        <BaitsModal
          sessions={sessions}
          baitCatalog={baitCatalog}
          groupId={groupId}
          userId={userId}
          initialBaitKey={baitsInitialKey}
          startAdding={baitsStartAdding}
          onCatalogChanged={loadBaitCatalog}
          onRenamePropagate={renameBaitEverywhere}
          onRemoveFromRods={removeBaitFromMyRods}
          onBackfillBaitPhoto={backfillBaitPhoto}
          onClose={() => { setShowBaits(false); setBaitsInitialKey(null); setBaitsStartAdding(false) }}
          onOpenCatch={(c, key) => { setShowBaits(false); setBaitsStartAdding(false); setBaitsInitialKey(key); setLocationsReturnId(null); setTicketCatch(c) }}
          onOpenSession={(sessionId) => { setShowBaits(false); setBaitsStartAdding(false); setActivePanel(null); setActiveId(sessionId); setViewMode('detail') }}
        />
      )}

      {showLocations && (
        <LocationsModal
          locations={locationsCatalog}
          sessions={sessions}
          userId={userId}
          initialLocationId={locationsReturnId}
          onUpdate={updateLocationsCatalogEntry}
          onDelete={deleteLocationFromCatalog}
          onClose={() => { setShowLocations(false); setLocationsReturnId(null) }}
          onAddArea={startAddLocationArea}
          onManageAreas={startManageLocationAreas}
          onOpenCatch={(c, locId) => {
            setShowLocations(false); setLocationsReturnId(locId); setBaitsInitialKey(null)
            setActivePanel(null); setActiveId(c.session_id); setViewMode('detail')
            setTicketCatch(c)
          }}
          onOpenSession={(sessionId) => {
            setShowLocations(false); setActivePanel(null)
            setActiveId(sessionId); setViewMode('detail')
          }}
          onFocusLocation={focusOnLocation}
        />
      )}

      {editingSession && (
        <SessionEditModal
          draft={editingSession}
          setDraft={setEditingSession}
          onSave={saveEditSession}
          onClose={() => setEditingSession(null)}
          onDelete={deleteSession}
          onRelocate={handleRelocateSession}
          onManageAreas={() => startManageAreas(sessions.find((s) => s.id === editingSession.id))}
          locationsCatalog={locationsCatalog}
          onPersistStation={persistStationChoice}
        />
      )}

      {ticketCatch && (
        <CatchTicket
          catchData={ticketCatch}
          session={sessionForCatch(ticketCatch)}
          catcherName={sessionForCatch(ticketCatch) ? userName(sessionForCatch(ticketCatch).user_id) : null}
          onShowToast={showToast}
          canEdit={sessionForCatch(ticketCatch)?.user_id === userId}
          baitPhotoMap={baitPhotoLookup()}
          baitListId={baitListId(sessionForCatch(ticketCatch)?.type)}
          baitCatalog={mergedBaitOptions(baitCategoryFor(sessionForCatch(ticketCatch)?.type))}
          baitCategory={baitCategoryFor(sessionForCatch(ticketCatch)?.type)}
          onAddBait={addBaitToCatalog}
          onBackfillBaitPhoto={backfillBaitPhoto}
          locationsCatalog={locationsCatalog}
          onSetCatchLocation={setCatchLocation}
          onRelocate={() => startRelocateCatch(ticketCatch.id)}
          onFocusLocation={() => {
            const c = ticketCatch
            const s = sessionForCatch(c)
            setTicketCatch(null)
            // Appka schválně nepřepíná záložku ve stejném tiku, co zavírá
            // úlovkový lístek -- zavření spouští odemčení scrollu
            // (useLockBodyScroll) a appka v appce nainstalované na ploše
            // má spodní lištu jako position:sticky. Obě věci najednou
            // krátce nechávaly nekonzistentní layout (kousek pozadí pod
            // lištou), co zmizelo až po dalším přepnutí záložky.
            //
            // useLockBodyScroll navíc obnoví scroll STRÁNKY přesně na
            // hodnotu, co appka měla PŘED otevřením lístku -- ale záložka
            // Mapa může mít jindy jinou výšku obsahu, takže ta stará
            // hodnota po návratu na Mapu neodpovídá nové výšce (appka tak
            // dostane zbytečně nenulový scroll). Appka scroll proto po
            // zavření vždy natvrdo vynuluje, ať nezávisí na tom, jaká
            // hodnota tam zůstala z předchozího stavu.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.scrollTo(0, 0)
                if (!s) { switchPanel('map'); return }
                setActiveId(s.id)
                setViewMode('detail')
                jumpToMapView(s, { lat: c.lat, lng: c.lng, zoom: 16 })
              })
            })
          }}
          onOpenSession={() => {
            const s = sessionForCatch(ticketCatch)
            if (s) { setTicketCatch(null); setMobileSheetOpen(false); setActivePanel(null); setActiveId(s.id); setViewMode('detail') }
          }}
          onClose={() => {
            setTicketCatch(null)
            if (baitsInitialKey) setShowBaits(true)
            if (locationsReturnId) setShowLocations(true)
          }}
          onUpdated={loadSessions}
          onDeleted={() => { setTicketCatch(null); loadSessions() }}
        />
      )}
      {toast && <div className="save-toast">{toast}</div>}
    </div>
  )
}

function SaveLocationForm({ source, onCancel, onSave }) {
  const [name, setName] = useState(source.title || '')
  const [revir, setRevir] = useState(source.revir || '')
  const [scope, setScope] = useState('spot')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await onSave(name, revir, scope)
    setBusy(false)
  }

  return (
    <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ticket" style={{ maxWidth: 380 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onCancel}><IconClose size={16} /></button>
          <div className="eyebrow">Katalog míst</div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconBookmark size={20} /> Uložit toto místo</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <p className="help-note" style={{ marginBottom: 10 }}>
            {source.area ? `Uloží se vyšrafovaná oblast (${source.area.length} ploch).` : 'Uloží se orientační bod pro rychlé přiblížení mapy.'}
          </p>
          <form onSubmit={handleSubmit}>
            <label className="field-label">Název místa</label>
            <input className="text-input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Labe - Vaflák" />
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
              <p className="help-note" style={{ marginTop: 6 }}>
                Velké úseky se nezobrazují na přehledové mapě mezi malými místy (nepřekrývaly by je) — jen v seznamu katalogu, nahoře. Celou plochu uvidíš po otevření detailu a kliknutí „Zobrazit na hlavní mapě".
              </p>
            )}
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Ukládám…' : 'Uložit do katalogu'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}

// Malá samostatná mapka v detailu výpravy -- appka ji drží jako vlastní
// Leaflet instanci (stejný vzor jako LocationPreviewMap v LocationsModal),
// ať se nemíchá se stavem té velké, sdílené mapy appky. Neinteraktivní
// (bez zoomu/tažení) -- klik na ni appku přepne rovnou na velkou mapu.
function SessionMiniMap({ session, userColor, onOpen }) {
  const mapEl = useRef(null)
  const mapInst = useRef(null)

  useEffect(() => {
    if (!mapEl.current) return
    const map = L.map(mapEl.current, {
      zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false,
    })
    mapInst.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    const bounds = []
    const isLure = MAP_LURE_LOOK_TYPES.includes(session.type)
    const makePointIcon = (num) => L.divIcon({
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid ${userColor};box-shadow:0 1px 5px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:8px;color:${userColor}">${num ?? ''}</div>`,
      className: '', iconSize: [16, 16], iconAnchor: [8, 8],
    })

    if (isLure && session.area) {
      (session.area || [])
        .filter((pts) => Array.isArray(pts))
        .map((pts) => pts.filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number'))
        .filter((pts) => pts.length >= 3)
        .forEach((pts) => {
          L.polygon(pts.map((p) => [p.lat, p.lng]), { color: '#6B7A4F', weight: 2, fillColor: '#6B7A4F', fillOpacity: 0.2 }).addTo(map)
          pts.forEach((p) => bounds.push([p.lat, p.lng]))
        })
    }

    if (isLure) {
      // appka u přívlače kreslí VŠECHNY body (hlavní i další místa) stejnou
      // bílou tečkou s lemem v barvě uživatele -- stejná identita jako na
      // velké mapě ve fokusovaném režimu. Místo další barvy appka body
      // rozliší číslem uvnitř tečky (1, 2, 3...), ať sedí s pořadím v
      // seznamu "Místa" pod mapkou.
      if (session.lat != null && session.lng != null) {
        L.marker([session.lat, session.lng], { icon: makePointIcon(1) }).addTo(map)
        bounds.push([session.lat, session.lng])
      }
      ;(session.rods || []).slice(1).forEach((r, i) => {
        if (r.lat == null || r.lng == null) return
        L.marker([r.lat, r.lng], { icon: makePointIcon(i + 2) }).addTo(map)
        bounds.push([r.lat, r.lng])
      })
    } else {
      // Bodové typy appka navíc ukáže bod "kde stojíš" -- appka ho
      // nastavuje přes GPS (živá výprava) nebo ručním umístěním (zpětná
      // výprava), a je to jiná souřadnice než jednotlivé pruty (appka je
      // klikáš samostatně, o kus dál). Velká mapa ho appka kreslí vždycky,
      // miniatura předtím ne -- doplněno, ať appka sedí na obou mapách.
      if (session.lat != null && session.lng != null) {
        L.marker([session.lat, session.lng], { icon: makePointIcon() }).addTo(map)
        bounds.push([session.lat, session.lng])
      }
      // Jediný prut appka ukáže v barvě uživatele, dva a víc appka odliší
      // barvami prutů -- stejné pravidlo jako na velké mapě.
      const rods = (session.rods || []).filter((r) => r.lat != null && r.lng != null)
      rods.forEach((r, i) => {
        const rodColor = rods.length === 1 ? userColor : rodColors[i % rodColors.length]
        const rodIcon = L.divIcon({
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${rodColor};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>`,
          className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        })
        L.marker([r.lat, r.lng], { icon: rodIcon }).addTo(map)
        bounds.push([r.lat, r.lng])
      })
    }

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 15 })
    else if (bounds.length === 1) map.setView(bounds[0], 14)
    else map.setView([49.8, 15.5], 8)
    setTimeout(() => map.invalidateSize(), 50)

    return () => { map.remove(); mapInst.current = null }
  }, [session.id, userColor])

  return (
    <div
      onClick={onOpen}
      title="Zobrazit na mapě"
      style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--paper-line)', cursor: 'pointer', isolation: 'isolate', position: 'relative' }}
    >
      <div ref={mapEl} style={{ width: '100%', height: 130, pointerEvents: 'none' }} />
      <span
        style={{
          position: 'absolute', right: 8, bottom: 8, zIndex: 2,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(255,255,255,.92)', color: 'var(--water-deep)',
          padding: '4px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          boxShadow: '0 2px 6px rgba(0,0,0,.18)',
        }}
      ><IconMap size={11} /> Otevřít mapu</span>
    </div>
  )
}

function RecordsModal({ sessions, userName, userColor, onOpenCatch }) {
  const bySpecies = {}
  sessions.forEach((s) => {
    ;(s.catches || []).forEach((c) => {
      if (!c.species || c.length_cm == null || c.length_cm === '') return
      const key = c.species.trim().toLowerCase()
      const len = Number(c.length_cm)
      if (!bySpecies[key] || len > Number(bySpecies[key].catchData.length_cm)) {
        bySpecies[key] = {
          label: c.species.trim(),
          catchData: c,
          session: s,
        }
      }
    })
  })
  const records = Object.values(bySpecies).sort((a, b) => Number(b.catchData.length_cm) - Number(a.catchData.length_cm))

  return (
    <>
      <div className="sb-head"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconTrophy size={14} color="var(--amber)" /> Rekordy party</span></div>
      <div style={{ padding: '0 18px 14px' }}>
        {records.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Zatím žádný úlovek s uvedenou délkou.</p>
          )}
          {records.map((r) => {
            const c = r.catchData
            const revir = c.revir || r.session.revir
            return (
              <div key={r.label} className="record-row" onClick={() => onOpenCatch(c)}>
                <div className="record-head">
                  <strong>{r.label}</strong>
                  <span className="record-length">{c.length_cm} cm</span>
                </div>
                <div className="record-sub">
                  <span className="user-dot" style={{ background: userColor(r.session.user_id) }} />
                  {userName(r.session.user_id)} · {c.caught_at ? c.caught_at.slice(0, 10) : r.session.session_date}
                  {revir ? ` · ${revir}` : ''}
                </div>
              </div>
            )
          })}
      </div>
    </>
  )
}

function StatsModal({ sessions: allSessions, members, userColor, statsSince }) {
  // --- přepínač Celkem / rok / Historie ---
  // "Spolehlivé" appka počítá od statsSince (datum vzniku skupiny --
  // groups.stats_since, appka to jde ručně posunout v Nastavení) --
  // odtud appka ví jistě, že máš zapsané i neúspěšné výpravy, ne jen
  // zpětně dopsané úlovky. Starší výpravy appka drží zvlášť pod
  // "Historie", protože tam "úspěšnost" (poměr výprava/úlovek) není
  // spolehlivá. Appka srovnává PŘESNÁ DATA (ne jen roky) -- funguje
  // správně i u skupiny založené v půlce roku.
  // Bez statsSince appka radši nedělí (žádná appka historie), ať appka
  // něco nespočítá tiše špatně -- to appce nastane jen krátce po
  // migraci, než appka doběhne loadGroupInfo().
  const cutoffDate = statsSince ? statsSince.slice(0, 10) : null
  function yearOf(s) { return s.session_date ? Number(s.session_date.slice(0, 4)) : null }
  const availableYears = cutoffDate
    ? Array.from(
        new Set(allSessions.filter((s) => s.session_date >= cutoffDate).map(yearOf).filter((y) => y != null))
      ).sort((a, b) => b - a)
    : Array.from(new Set(allSessions.map(yearOf).filter((y) => y != null))).sort((a, b) => b - a)
  const hasHistory = cutoffDate ? allSessions.some((s) => s.session_date && s.session_date < cutoffDate) : false

  const [statsView, setStatsView] = useState('celkem') // 'celkem' | rok (string) | 'historie'

  const sessions = !cutoffDate
    ? allSessions
    : statsView === 'celkem'
      ? allSessions.filter((s) => !s.session_date || s.session_date >= cutoffDate)
      : statsView === 'historie'
        ? allSessions.filter((s) => s.session_date && s.session_date < cutoffDate)
        : allSessions.filter((s) => yearOf(s) === Number(statsView))

  const byUser = {}
  sessions.forEach((s) => {
    const uid = s.user_id
    if (!byUser[uid]) byUser[uid] = { visits: 0, species: {} }
    byUser[uid].visits += 1
    ;(s.catches || []).forEach((c) => {
      const sp = c.species || 'Neuvedeno'
      byUser[uid].species[sp] = (byUser[uid].species[sp] || 0) + 1
    })
  })

  const totalVisits = sessions.length
  const totalSpecies = {}
  Object.values(byUser).forEach((u) => {
    Object.entries(u.species).forEach(([sp, n]) => { totalSpecies[sp] = (totalSpecies[sp] || 0) + n })
  })
  const totalCatches = Object.values(totalSpecies).reduce((a, b) => a + b, 0)

  function speciesTotal(speciesObj) {
    return Object.values(speciesObj).reduce((a, b) => a + b, 0)
  }

  // --- úspěšnost cíle u dravce (jen přívlač má vyplněné textové pole "Cíl") ---
  const targetStats = {}
  const targetStatsByUser = {}
  sessions.forEach((s) => {
    const t = (s.target_species || '').trim()
    if (!t) return
    const key = t.toLowerCase()
    const isGeneral = key.includes('obecně')
    const success = (s.catches || []).some((c) => isGeneral ? c.category === 'dravec' : c.species?.trim().toLowerCase() === key)

    if (!targetStats[key]) targetStats[key] = { label: t, attempts: 0, successes: 0 }
    targetStats[key].attempts += 1
    if (success) targetStats[key].successes += 1

    const uid = s.user_id
    if (!targetStatsByUser[uid]) targetStatsByUser[uid] = {}
    if (!targetStatsByUser[uid][key]) targetStatsByUser[uid][key] = { label: t, attempts: 0, successes: 0 }
    targetStatsByUser[uid][key].attempts += 1
    if (success) targetStatsByUser[uid][key].successes += 1
  })
  const targetRows = Object.values(targetStats)

  // --- úspěšnost bílé ryby ---
  // Kapr a plavaná nemají žádné textové pole "cíl" jako přívlač výše --
  // appka úspěch odvodí přímo z TYPU výpravy: výprava typu "kapr" nebo
  // "plavana" je úspěšná, pokud má aspoň jeden úlovek s kategorií
  // "bila" (appka ji tam dá i ručně, kdyby náhodou
  // chytil na kapří výpravě dravce -- appka to nezapočítá jako
  // úspěch bílé ryby).
  const WHITE_FISH_TYPES = ['kapr', 'plavana']
  const whiteFishStats = { attempts: 0, successes: 0 }
  const whiteFishStatsByUser = {}
  sessions.forEach((s) => {
    if (!WHITE_FISH_TYPES.includes(s.type)) return
    const success = (s.catches || []).some((c) => c.category === 'bila')
    whiteFishStats.attempts += 1
    if (success) whiteFishStats.successes += 1
    const uid = s.user_id
    if (!whiteFishStatsByUser[uid]) whiteFishStatsByUser[uid] = { attempts: 0, successes: 0 }
    whiteFishStatsByUser[uid].attempts += 1
    if (success) whiteFishStatsByUser[uid].successes += 1
  })

  // --- čas u vody ---
  // Appka počítá jen z výprav, co mají vyplněné oba časy (appka to
  // nedělá povinné) -- appka to transparentně poznamená pod
  // celkovým souhrnem.
  const timeStatsByUser = {}
  const timeStatsTotal = { minutes: 0, timedSessions: 0, catches: { celkem: 0, dravec: 0, bila: 0 } }
  sessions.forEach((s) => {
    const minutes = sessionDurationMinutes(s)
    if (minutes == null) return
    const uid = s.user_id
    if (!timeStatsByUser[uid]) timeStatsByUser[uid] = { minutes: 0, timedSessions: 0, catches: { celkem: 0, dravec: 0, bila: 0 } }
    const dravecN = (s.catches || []).filter((c) => c.category === 'dravec').length
    const bilaN = (s.catches || []).filter((c) => c.category === 'bila').length
    const celkemN = (s.catches || []).length
    timeStatsByUser[uid].minutes += minutes
    timeStatsByUser[uid].timedSessions += 1
    timeStatsByUser[uid].catches.celkem += celkemN
    timeStatsByUser[uid].catches.dravec += dravecN
    timeStatsByUser[uid].catches.bila += bilaN
    timeStatsTotal.minutes += minutes
    timeStatsTotal.timedSessions += 1
    timeStatsTotal.catches.celkem += celkemN
    timeStatsTotal.catches.dravec += dravecN
    timeStatsTotal.catches.bila += bilaN
  })
  function perHour(minutes, catches) {
    if (!minutes || !catches) return null
    return (catches / (minutes / 60)).toFixed(1)
  }

  // --- "Kdy se daří" -- appka to počítá samostatně pro
  // dravce a pro bílou rybu -- úspěšnost dravce v nějakou denní dobu
  // neznamená nic pozitivního pro bílou rybu.
  const pressureOrder = ['<1000 hPa', '1000–1010 hPa', '1010–1020 hPa', '1020+ hPa']
  const trendOrder = ['klesá', 'stabilní', 'roste']
  const spaOrder = [-1, 0, 1, 2, 3]
  const monthOrder = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
  const hourBucketOrder = ['noc (0–5)', 'ráno (5–9)', 'dopoledne (9–12)', 'odpoledne (12–17)', 'večer (17–21)', 'pozdní večer (21–24)']

  function hourBucket(hour) {
    if (hour < 5) return 'noc (0–5)'
    if (hour < 9) return 'ráno (5–9)'
    if (hour < 12) return 'dopoledne (9–12)'
    if (hour < 17) return 'odpoledne (12–17)'
    if (hour < 21) return 'večer (17–21)'
    return 'pozdní večer (21–24)'
  }

  function buildCorrelationStats(category) {
    const byMoonPhase = {}, byPressureBucket = {}, byPressureTrend = {}, bySpaLevel = {}, byMonth = {}, byHour = {}
    let total = 0, withHour = 0
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => {
        if (c.category !== category) return
        total += 1
        // Appka upřednostní datum/čas samotného úlovku (appka ho od
        // opravy přechodu přes půlnoc počítá přesněji) a teprve bez
        // něj spadne na datum výpravy.
        const dateStr = c.caught_at ? c.caught_at.slice(0, 10) : s.session_date
        const phase = dateStr ? moonPhaseName(dateStr) : null
        if (phase) byMoonPhase[phase] = (byMoonPhase[phase] || 0) + 1
        const p = c.weather_pressure_hpa ?? s.weather_pressure_hpa
        if (p != null && p !== '') {
          const bucket = p < 1000 ? '<1000 hPa' : p < 1010 ? '1000–1010 hPa' : p < 1020 ? '1010–1020 hPa' : '1020+ hPa'
          byPressureBucket[bucket] = (byPressureBucket[bucket] || 0) + 1
        }
        const trend = c.weather_pressure_trend ?? s.weather_pressure_trend
        if (trend != null) {
          const key = trend > 0 ? 'roste' : trend < 0 ? 'klesá' : 'stabilní'
          byPressureTrend[key] = (byPressureTrend[key] || 0) + 1
        }
        const sessionSpa = s.water_stations?.length > 0 ? s.water_stations[0].spa_level : s.water_spa_level
        const spa = c.water_spa_level ?? sessionSpa
        if (spa != null) bySpaLevel[spa] = (bySpaLevel[spa] || 0) + 1
        if (dateStr) {
          const month = monthOrder[Number(dateStr.slice(5, 7)) - 1]
          if (month) byMonth[month] = (byMonth[month] || 0) + 1
        }
        if (c.caught_at) {
          byHour[hourBucket(new Date(c.caught_at).getHours())] = (byHour[hourBucket(new Date(c.caught_at).getHours())] || 0) + 1
          withHour += 1
        }
      })
    })
    return {
      total, withHour,
      moonRows: Object.entries(byMoonPhase).sort((a, b) => b[1] - a[1]),
      pressureRows: pressureOrder.filter((k) => byPressureBucket[k]).map((k) => [k, byPressureBucket[k]]),
      trendRows: trendOrder.filter((k) => byPressureTrend[k]).map((k) => [k, byPressureTrend[k]]),
      spaRows: spaOrder.filter((k) => bySpaLevel[k]).map((k) => [k, bySpaLevel[k]]),
      monthRows: monthOrder.filter((k) => byMonth[k]).map((k) => [k, byMonth[k]]),
      hourRows: hourBucketOrder.filter((k) => byHour[k]).map((k) => [k, byHour[k]]),
    }
  }
  const dravecCorr = buildCorrelationStats('dravec')
  const bilaCorr = buildCorrelationStats('bila')

  // --- nejlovnější nástraha (odděleně dravec/bílá, stejný důvod jako výše) ---
  function topBaits(category, limit = 3) {
    const map = {}
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => {
        if (c.category !== category) return
        const name = (c.bait || '').trim()
        if (!name) return
        const key = name.toLowerCase()
        if (!map[key]) map[key] = { label: name, n: 0 }
        map[key].n += 1
      })
    })
    return Object.values(map).sort((a, b) => b.n - a.n).slice(0, limit)
  }
  const topBaitsDravec = topBaits('dravec')
  const topBaitsBila = topBaits('bila')

  // --- nejlovnější revír -- appka tady úmyslně NEROZDĚLUJE podle
  // kategorie, revír sám o sobě není dravčí ani bílý -- počty podle
  // kategorie appka jen doplňkově uvede u každého řádku.
  function topRevirs(limit = 5) {
    const map = {}
    sessions.forEach((s) => {
      ;(s.catches || []).forEach((c) => {
        const name = (c.revir || s.revir || '').trim()
        if (!name) return
        const key = name.toLowerCase()
        if (!map[key]) map[key] = { label: name, celkem: 0, dravec: 0, bila: 0 }
        map[key].celkem += 1
        if (c.category === 'dravec') map[key].dravec += 1
        if (c.category === 'bila') map[key].bila += 1
      })
    })
    return Object.values(map).sort((a, b) => b.celkem - a.celkem).slice(0, limit)
  }
  const revirRows = topRevirs()

  function renderCorrelation(corr) {
    if (corr.total === 0) return <p className="rod-bait">zatím žádný úlovek</p>
    return (
      <>
        {corr.moonRows.length > 0 && (
          <>
            <div className="stats-total" style={{ marginTop: 8 }}>Podle fáze měsíce</div>
            <div className="stats-species" style={{ marginTop: 4 }}>
              {corr.moonRows.map(([phase, n]) => (
                <span className="bait-chip" key={phase}><IconMoonPhase phase={phase} size={13} /> {phase} — {n}×</span>
              ))}
            </div>
          </>
        )}
        {corr.pressureRows.length > 0 && (
          <>
            <div className="stats-total" style={{ marginTop: 10 }}>Podle tlaku</div>
            <div className="stats-species" style={{ marginTop: 4 }}>
              {corr.pressureRows.map(([bucket, n]) => (
                <span className="bait-chip" key={bucket}><IconGauge size={13} /> {bucket} — {n}×</span>
              ))}
            </div>
          </>
        )}
        {corr.trendRows.length > 0 && (
          <>
            <div className="stats-total" style={{ marginTop: 10 }}>Podle trendu tlaku</div>
            <div className="stats-species" style={{ marginTop: 4 }}>
              {corr.trendRows.map(([trend, n]) => (
                <span className="bait-chip" key={trend}>
                  <IconPressureTrend trend={trend === 'roste' ? 1 : trend === 'klesá' ? -1 : 0} size={13} /> {trend} — {n}×
                </span>
              ))}
            </div>
          </>
        )}
        {corr.spaRows.length > 0 && (
          <>
            <div className="stats-total" style={{ marginTop: 10 }}>Podle vodního stavu</div>
            <div className="stats-species" style={{ marginTop: 4 }}>
              {corr.spaRows.map(([level, n]) => (
                <span className="bait-chip" key={level}>{SPA_LEVEL_INFO[level]?.icon} {SPA_LEVEL_INFO[level]?.label} — {n}×</span>
              ))}
            </div>
          </>
        )}
        {corr.monthRows.length > 0 && (
          <>
            <div className="stats-total" style={{ marginTop: 10 }}>Podle měsíce v roce</div>
            <div className="stats-species" style={{ marginTop: 4 }}>
              {corr.monthRows.map(([month, n]) => (
                <span className="bait-chip" key={month}>{month} — {n}×</span>
              ))}
            </div>
          </>
        )}
        {corr.hourRows.length > 0 && (
          <>
            <div className="stats-total" style={{ marginTop: 10 }}>Podle denní doby</div>
            <div className="stats-species" style={{ marginTop: 4 }}>
              {corr.hourRows.map(([bucket, n]) => (
                <span className="bait-chip" key={bucket}>{bucket} — {n}×</span>
              ))}
            </div>
            <p className="help-note" style={{ marginTop: 4 }}>Jen z úlovků s vyplněným časem ({corr.withHour} z {corr.total}).</p>
          </>
        )}
      </>
    )
  }

  return (
    <>
      <div className="sb-head"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconChart size={14} color="var(--water-deep)" /> Statistiky party</span></div>
      <div className="filter-row" style={{ padding: '0 18px 10px' }}>
        <button className={`filter-chip ${statsView === 'celkem' ? 'active' : ''}`} onClick={() => setStatsView('celkem')}>Celkem</button>
        {availableYears.map((y) => (
          <button key={y} className={`filter-chip ${statsView === String(y) ? 'active' : ''}`} onClick={() => setStatsView(String(y))}>{y}</button>
        ))}
        {hasHistory && (
          <button className={`filter-chip ${statsView === 'historie' ? 'active' : ''}`} onClick={() => setStatsView('historie')}>Historie</button>
        )}
      </div>
      {statsView === 'historie' && (
        <p className="help-note" style={{ padding: '0 18px 10px' }}>
          Výpravy před {cutoffDate?.split('-').reverse().join('.')} appka nemusí mít zapsané neúspěšné výpravy (jen zpětně dopsané úlovky) —
          čísla úspěšnosti tady proto neber jako přesná, počty úlovků a druhů v pořádku jsou.
        </p>
      )}
      <div style={{ padding: '0 18px 14px' }}>
        {members.map((m) => {
            const u = byUser[m.id] || { visits: 0, species: {} }
            return (
              <div className="stats-row" key={m.id}>
                <div className="stats-row-head">
                  <span className="user-dot" style={{ background: userColor(m.id) }} />
                  <strong>{m.name}</strong>
                  <span className="stats-visits">{u.visits} výprav</span>
                </div>
                <div className="stats-species">
                  {Object.entries(u.species).length === 0 && <span className="rod-bait">zatím žádný úlovek</span>}
                  {Object.entries(u.species).map(([sp, n]) => (
                    <span className="bait-chip" key={sp}>{sp} ×{n}</span>
                  ))}
                </div>
                <div className="stats-total">Celkem úlovků: {speciesTotal(u.species)}</div>
                {(targetStatsByUser[m.id] || whiteFishStatsByUser[m.id]) && (
                  <div className="stats-species" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
                    {targetStatsByUser[m.id] && Object.values(targetStatsByUser[m.id]).map((t) => (
                      <span key={t.label} className="bait-chip" style={{ width: '100%' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconTarget size={13} color="var(--amber-deep)" /> {t.label}: {t.successes} z {t.attempts} ({Math.round((t.successes / t.attempts) * 100)}%)</span>
                      </span>
                    ))}
                    {whiteFishStatsByUser[m.id] && (
                      <span className="bait-chip" style={{ width: '100%' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconTarget size={13} color="var(--water-mid)" /> Bílá ryba: {whiteFishStatsByUser[m.id].successes} z {whiteFishStatsByUser[m.id].attempts} ({Math.round((whiteFishStatsByUser[m.id].successes / whiteFishStatsByUser[m.id].attempts) * 100)}%)</span>
                      </span>
                    )}
                  </div>
                )}
                {timeStatsByUser[m.id] && (
                  <div className="stats-total" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <IconClock size={13} color="var(--water-mid)" />
                    Čas u vody: {formatDurationHM(timeStatsByUser[m.id].minutes)}
                    {timeStatsByUser[m.id].catches.celkem > 0 && (
                      <span>· {perHour(timeStatsByUser[m.id].minutes, timeStatsByUser[m.id].catches.celkem)} úlovku/h ({timeStatsByUser[m.id].catches.celkem}× celkem, {timeStatsByUser[m.id].catches.dravec}× dravec, {timeStatsByUser[m.id].catches.bila}× bílá)</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div className="stats-row stats-total-row">
            <div className="stats-row-head"><strong>Celkem (celá parta)</strong><span className="stats-visits">{totalVisits} výprav</span></div>
            <div className="stats-species">
              {Object.entries(totalSpecies).map(([sp, n]) => (
                <span className="bait-chip" key={sp}>{sp} ×{n}</span>
              ))}
            </div>
            <div className="stats-total">Celkem úlovků: {totalCatches}</div>
            {(targetRows.length > 0 || whiteFishStats.attempts > 0) && (
              <div className="stats-species" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
                {targetRows.map((t) => (
                  <span key={t.label} className="bait-chip" style={{ width: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconTarget size={13} color="var(--amber-deep)" /> {t.label}: {t.successes} z {t.attempts} ({Math.round((t.successes / t.attempts) * 100)}%)</span>
                  </span>
                ))}
                {whiteFishStats.attempts > 0 && (
                  <span className="bait-chip" style={{ width: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconTarget size={13} color="var(--water-mid)" /> Bílá ryba: {whiteFishStats.successes} z {whiteFishStats.attempts} ({Math.round((whiteFishStats.successes / whiteFishStats.attempts) * 100)}%)</span>
                  </span>
                )}
              </div>
            )}
            {timeStatsTotal.timedSessions > 0 && (
              <div className="stats-total" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <IconClock size={13} color="var(--water-mid)" />
                Čas u vody: {formatDurationHM(timeStatsTotal.minutes)}
                {timeStatsTotal.catches.celkem > 0 && (
                  <span>· {perHour(timeStatsTotal.minutes, timeStatsTotal.catches.celkem)} úlovku/h ({timeStatsTotal.catches.celkem}× celkem, {timeStatsTotal.catches.dravec}× dravec, {timeStatsTotal.catches.bila}× bílá)</span>
                )}
              </div>
            )}
            {timeStatsTotal.timedSessions > 0 && (
              <p className="help-note" style={{ marginTop: 4 }}>Jen z výprav s vyplněným časem Od/Do ({timeStatsTotal.timedSessions} z {totalVisits}).</p>
            )}
          </div>

          {(dravecCorr.total > 0 || bilaCorr.total > 0) && (
            <div className="stats-row" style={{ borderBottom: 'none' }}>
              <div className="stats-row-head"><strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconTrend size={15} /> Kdy se daří</strong></div>
              <p className="help-note">Dravce a bílou rybu appka počítá samostatně — úspěšnost jednoho nic neříká o druhém.</p>
              {dravecCorr.total > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="stats-total" style={{ fontWeight: 600 }}><span className="s-tag category-dravec">Dravec</span></div>
                  {renderCorrelation(dravecCorr)}
                </div>
              )}
              {bilaCorr.total > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="stats-total" style={{ fontWeight: 600 }}><span className="s-tag category-bila">Bílá ryba</span></div>
                  {renderCorrelation(bilaCorr)}
                </div>
              )}
              <p className="help-note" style={{ marginTop: 10 }}>Počítáno jen z toho, co máte zapsané — čím víc výprav, tím spolehlivější vzorec.</p>
            </div>
          )}

          {(topBaitsDravec.length > 0 || topBaitsBila.length > 0) && (
            <div className="stats-row" style={{ borderBottom: 'none' }}>
              <div className="stats-row-head"><strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconNastraha size={15} color="var(--water-deep)" /> Nejlovnější nástraha</strong></div>
              {topBaitsDravec.length > 0 && (
                <>
                  <div className="stats-total" style={{ marginTop: 8 }}>Dravec</div>
                  <div className="stats-species" style={{ marginTop: 4 }}>
                    {topBaitsDravec.map((b) => <span className="bait-chip" key={b.label}>{b.label} — {b.n}×</span>)}
                  </div>
                </>
              )}
              {topBaitsBila.length > 0 && (
                <>
                  <div className="stats-total" style={{ marginTop: 10 }}>Bílá ryba</div>
                  <div className="stats-species" style={{ marginTop: 4 }}>
                    {topBaitsBila.map((b) => <span className="bait-chip" key={b.label}>{b.label} — {b.n}×</span>)}
                  </div>
                </>
              )}
            </div>
          )}

          {revirRows.length > 0 && (
            <div className="stats-row" style={{ borderBottom: 'none' }}>
              <div className="stats-row-head"><strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconRevir size={15} color="var(--water-deep)" /> Nejlovnější revír</strong></div>
              <div className="stats-species" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
                {revirRows.map((r) => (
                  <span key={r.label} className="bait-chip" style={{ width: '100%' }}>
                    {r.label}: {r.celkem}× celkem{r.dravec > 0 ? `, ${r.dravec}× dravec` : ''}{r.bila > 0 ? `, ${r.bila}× bílá` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
      </div>
    </>
  )
}

function SessionEditModal({ draft, setDraft, onSave, onClose, onDelete, onRelocate, onManageAreas, locationsCatalog = [], onPersistStation }) {
  useLockBodyScroll()
  const [busy, setBusy] = useState(false)
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherError, setWeatherError] = useState(null)
  const [stationPickerOpen, setStationPickerOpen] = useState(false)
  const [stationOptions, setStationOptions] = useState([])
  const [stationPickerBusy, setStationPickerBusy] = useState(false)

  function set(field, value) { setDraft((d) => ({ ...d, [field]: value })) }

  // Ruční oprava stanice ČHMÚ -- appka jinak vybírá stanici jen podle
  // vzdušné vzdálenosti (i s nápovědou podle řeky se občas netrefí,
  // např. u soutoků), takže appka musí dát možnost výběr přebít ručně.
  async function openStationPicker() {
    setStationPickerOpen(true)
    setStationPickerBusy(true)
    try {
      const list = await findNearestStations(draft.lat, draft.lng, 6, extractRiverName(draft.revir || draft.title))
      setStationOptions(list)
    } catch {
      setStationOptions([])
    }
    setStationPickerBusy(false)
  }

  async function pickStation(s) {
    setStationPickerOpen(false)
    setWeatherBusy(true)
    try {
      const water = await fetchWaterConditions(s.objID, draft.date, draft.timeFrom)
      setDraft((d) => ({
        ...d,
        waterStations: [{
          station_id: s.objID, station_name: s.name,
          level_cm: water?.level_cm ?? null, flow_m3s: water?.flow_m3s ?? null, temp_c: water?.temp_c ?? null,
          spa_level: water?.spa_level ?? null, precision: water?.precision ?? null,
        }],
        waterLevel: water?.level_cm ?? null, waterFlow: water?.flow_m3s ?? null, waterTemp: water?.temp_c ?? null,
        waterStationName: s.name, waterPrecision: water?.precision ?? null, waterSpaLevel: water?.spa_level ?? null,
      }))
      // Appka opravu zapamatuje pro příště (uloží ji do katalogu míst) a
      // pokud šlo o nový/jiný záznam než dosud navázaný, appka propojí
      // tuhle (už uloženou) výpravu s ním, ať se to hned projeví i tady.
      if (onPersistStation) {
        const locId = await onPersistStation(
          { lat: draft.lat, lng: draft.lng }, draft.title, draft.revir, draft.linkedLocationIds, s
        )
        if (locId && !(draft.linkedLocationIds || []).includes(locId)) {
          await supabase.from('session_locations').insert({ session_id: draft.id, location_id: locId })
          setDraft((d) => ({ ...d, linkedLocationIds: [...(d.linkedLocationIds || []), locId] }))
        }
      }
    } catch {
      setWeatherError('Nepodařilo se natáhnout data pro vybranou stanici.')
    }
    setWeatherBusy(false)
  }

  async function handleFetchWeather() {
    setWeatherBusy(true); setWeatherError(null)
    try {
      const w = await fetchWeather(draft.lat, draft.lng, draft.date, draft.timeFrom)
      setDraft((d) => ({ ...d, temp: w.temp, pressure: w.pressure, pressureTrend: w.pressureTrend, wind: w.wind, desc: w.desc }))
    } catch (e) {
      setWeatherError(e.message)
    }
    // vodní stav — nezávisle na počasí, tiché selhání (žádná chyba nezobrazená uživateli)
    try {
      const stations = resolveHydroStations(draft.linkedLocationIds, locationsCatalog)
      const byRevir = stations.length === 0 ? findStationsByRevir(draft.revir, locationsCatalog) : []
      const targets = stations.length > 0 ? stations : byRevir.length > 0 ? byRevir : await findNearestStations(draft.lat, draft.lng, 1, extractRiverName(draft.revir || draft.title))
      const results = (await Promise.all(targets.map(async (station) => {
        const water = await fetchWaterConditions(station.objID, draft.date, draft.timeFrom)
        return water ? { station_id: station.objID, station_name: station.name, level_cm: water.level_cm, flow_m3s: water.flow_m3s, temp_c: water.temp_c, spa_level: water.spa_level, precision: water.precision } : null
      }))).filter(Boolean)
      if (results.length > 0) {
        setDraft((d) => ({
          ...d,
          waterStations: results,
          waterLevel: results[0].level_cm, waterFlow: results[0].flow_m3s, waterTemp: results[0].temp_c,
          waterStationName: results[0].station_name, waterPrecision: results[0].precision, waterSpaLevel: results[0].spa_level,
        }))
      }
    } catch (err) {
      console.warn('ČHMÚ se nepovedlo (appka to nechá prázdné):', err)
    }
    setWeatherBusy(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await onSave()
    setBusy(false)
  }

  return (
    <div className="modal-bg show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ticket" style={{ maxWidth: 400 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
          <div className="eyebrow">Úprava výpravy</div>
          <h2>{draft.title || 'Výprava'}</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <form onSubmit={handleSubmit}>
            <label className="field-label">Název výpravy</label>
            <input className="text-input" required value={draft.title} onChange={(e) => set('title', e.target.value)} />
            <label className="field-label">Revír / lokalita</label>
            <input className="text-input" value={draft.revir} onChange={(e) => set('revir', e.target.value)} placeholder="např. Labe 19, Jizera - Kárany" />
            {LURE_TYPES.includes(draft.type) && (
              <>
                <label className="field-label">Cíl (nepovinné)</label>
                <label className="location-check-row" style={{ marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.target_species === 'Obecně dravci'}
                    onChange={(e) => set('target_species', e.target.checked ? 'Obecně dravci' : '')}
                  />
                  Obecně dravci
                </label>
                {draft.target_species !== 'Obecně dravci' && (
                  <input
                    className="text-input"
                    value={draft.target_species || ''}
                    onChange={(e) => set('target_species', e.target.value)}
                    placeholder="nebo napiš konkrétní druh…"
                    list="known-species"
                    autoComplete="off"
                  />
                )}
              </>
            )}
            <div className="input-row">
              <div className="input-row-auto">
                <label className="field-label">Datum</label>
                <input className="text-input" type="date" required value={draft.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="input-row-auto">
                <label className="field-label">Od</label>
                <input className="text-input" type="time" value={draft.timeFrom} onChange={(e) => set('timeFrom', e.target.value)} />
              </div>
              <div className="input-row-auto">
                <label className="field-label">Do</label>
                <input className="text-input" type="time" value={draft.timeTo} onChange={(e) => set('timeTo', e.target.value)} />
              </div>
            </div>
            <p className="hint-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconMoonPhase phase={moonPhaseName(draft.date)} size={13} /> {moonPhaseName(draft.date)}</p>
            {crossesMidnight(draft.timeFrom, draft.timeTo) && (
              <p className="hint-text">🌙 Výprava přes půlnoc — trvání {formatDurationHM(sessionDurationMinutes({ time_from: draft.timeFrom, time_to: draft.timeTo }))}.</p>
            )}

            <button type="button" className="new-btn" onClick={handleFetchWeather} disabled={weatherBusy}>
              {weatherBusy ? 'Zjišťuji…' : <><IconRefresh size={13} /> Přepočítat podmínky pro nové datum</>}
            </button>
            {weatherError && <p className="error-text">{weatherError}</p>}
            {draft.waterStations?.length > 0 ? (
              draft.waterStations.map((ws) => (
                <p key={ws.station_id} className="hint-text" style={{ marginTop: 6 }}>
                  <IconDroplet size={13} color="var(--water-mid)" /> {ws.level_cm != null ? `${ws.level_cm} cm` : '—'} · {ws.flow_m3s != null ? `${ws.flow_m3s} m³/s` : '—'}
                  {ws.temp_c != null ? ` · ${ws.temp_c} °C` : ''} ({ws.station_name}{ws.precision ? `, ${WATER_PRECISION_LABEL[ws.precision]}` : ''})
                  {ws.spa_level != null && SPA_LEVEL_INFO[ws.spa_level] ? ` · ${SPA_LEVEL_INFO[ws.spa_level].icon} ${SPA_LEVEL_INFO[ws.spa_level].label}` : ''}
                </p>
              ))
            ) : draft.waterStationName && (
              <p className="hint-text" style={{ marginTop: 6 }}>
                <IconDroplet size={13} color="var(--water-mid)" /> {draft.waterLevel != null ? `${draft.waterLevel} cm` : '—'} · {draft.waterFlow != null ? `${draft.waterFlow} m³/s` : '—'}
                {draft.waterTemp != null ? ` · ${draft.waterTemp} °C` : ''} ({draft.waterStationName}{draft.waterPrecision ? `, ${WATER_PRECISION_LABEL[draft.waterPrecision]}` : ''})
                {draft.waterSpaLevel != null && SPA_LEVEL_INFO[draft.waterSpaLevel] ? ` · ${SPA_LEVEL_INFO[draft.waterSpaLevel].icon} ${SPA_LEVEL_INFO[draft.waterSpaLevel].label}` : ''}
              </p>
            )}
            {(draft.waterStations?.length > 0 || draft.waterStationName) && !stationPickerOpen && (
              <button type="button" className="new-btn" style={{ marginTop: 4 }} onClick={openStationPicker}>Změnit stanici</button>
            )}
            {stationPickerOpen && (
              <div style={{ marginTop: 6 }}>
                {stationPickerBusy && <p className="hint-text">Hledám nejbližší stanice…</p>}
                {!stationPickerBusy && stationOptions.length === 0 && <p className="hint-text">ČHMÚ nevrátilo žádné stanice.</p>}
                {!stationPickerBusy && stationOptions.map((s) => (
                  <div key={s.objID} className="bait-picker-item" onClick={() => pickStation(s)}>
                    {s.name}{s.stream ? ` (${s.stream})` : ''}
                  </div>
                ))}
                <button type="button" className="new-btn" style={{ marginTop: 4 }} onClick={() => setStationPickerOpen(false)}>Zrušit</button>
              </div>
            )}

            <div className="input-row" style={{ marginTop: 10 }}>
              <div>
                <label className="field-label">Teplota °C</label>
                <input className="text-input" type="number" value={draft.temp} onChange={(e) => set('temp', e.target.value)} />
              </div>
              <div>
                <label className="field-label">Tlak hPa</label>
                <input className="text-input" type="number" value={draft.pressure} onChange={(e) => set('pressure', e.target.value)} />
              </div>
              <div>
                <label className="field-label">Vítr</label>
                <input className="text-input" value={draft.wind} onChange={(e) => set('wind', e.target.value)} />
              </div>
            </div>
            <label className="field-label">Popis počasí</label>
            <input className="text-input" value={draft.desc} onChange={(e) => set('desc', e.target.value)} />

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn-primary" style={{ margin: 0, flex: 1 }} type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit změny'}</button>
              <button type="button" className="new-btn danger-btn" onClick={onDelete}><IconTrash size={13} /> Smazat výpravu</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ userId, profile, groupId, groupInfo, onSaved, onGroupSaved }) {
  const [name, setName] = useState(profile?.display_name || '')
  const [color, setColor] = useState(profile?.color || USER_PALETTE[0])
  const [busy, setBusy] = useState(false)

  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMessage, setPwMessage] = useState(null)
  const [pwError, setPwError] = useState(null)

  // --- od kdy appka počítá statistiky jako spolehlivé (viz StatsModal) ---
  const initialStatsSince = (groupInfo?.stats_since || groupInfo?.created_at || '').slice(0, 10)
  const [statsSince, setStatsSinceInput] = useState(initialStatsSince)
  const [statsSinceBusy, setStatsSinceBusy] = useState(false)
  const [statsSinceMessage, setStatsSinceMessage] = useState(null)
  const [statsSinceError, setStatsSinceError] = useState(null)

  async function handleSaveStatsSince(e) {
    e.preventDefault()
    setStatsSinceError(null)
    setStatsSinceMessage(null)
    if (!statsSince) { setStatsSinceError('Vyber datum.'); return }
    setStatsSinceBusy(true)
    const { data, error } = await supabase.from('groups')
      .update({ stats_since: statsSince })
      .eq('id', groupId)
      .select()
      .single()
    setStatsSinceBusy(false)
    if (error) { setStatsSinceError(error.message); return }
    onGroupSaved?.(data)
    setStatsSinceMessage('Uloženo — appka od tohohle data počítá "Celkem" ve Statistikách.')
  }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.from('profiles')
      .update({ display_name: name, color })
      .eq('id', userId)
      .select()
      .single()
    setBusy(false)
    if (error) { alert(error.message); return }
    onSaved(data)
  }

  async function handleSetPassword(e) {
    e.preventDefault()
    setPwError(null)
    setPwMessage(null)
    if (password.length < 6) { setPwError('Heslo musí mít aspoň 6 znaků.'); return }
    if (password !== password2) { setPwError('Hesla se neshodují.'); return }
    setPwBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPwBusy(false)
    if (error) { setPwError(error.message); return }
    setPassword(''); setPassword2('')
    setPwMessage('Heslo je nastaveno. Od teď se můžeš přihlašovat i heslem, bez čekání na e-mail.')
  }

  return (
    <>
      <div className="sb-head"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconSettings size={14} color="var(--water-deep)" /> Tvůj profil</span></div>
      <div style={{ padding: '0 18px 14px' }}>
          <form onSubmit={handleSave}>
            <label className="field-label">Jméno, pod kterým budeš uveden</label>
            <input className="text-input" required value={name} onChange={(e) => setName(e.target.value)} />
            <label className="field-label" style={{ marginTop: 14 }}>Tvoje barva (úlovky, mapa, seznam výprav)</label>
            <div className="color-swatches">
              {USER_PALETTE.map((c) => (
                <button
                  key={c} type="button"
                  className={`color-swatch ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 16 }}>{busy ? 'Ukládám…' : 'Uložit'}</button>
          </form>

          <div style={{ borderTop: '1px dashed var(--paper-line)', marginTop: 20, paddingTop: 16 }}>
            <label className="field-label" style={{ marginTop: 0 }}>Přihlašovací heslo (nepovinné)</label>
            <p className="help-note">Nastav si heslo, ať se nemusíš pokaždé přihlašovat přes e-mail — hodí se hlavně na appku na ploše telefonu.</p>
            <form onSubmit={handleSetPassword}>
              <input className="text-input" type="password" placeholder="nové heslo (aspoň 6 znaků)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginTop: 8 }} />
              <input className="text-input" type="password" placeholder="zopakuj heslo" value={password2} onChange={(e) => setPassword2(e.target.value)} style={{ marginTop: 8 }} />
              {pwError && <p className="error-text">{pwError}</p>}
              {pwMessage && <p className="hint-text" style={{ marginTop: 8 }}>{pwMessage}</p>}
              <button className="new-btn" type="submit" disabled={pwBusy} style={{ marginTop: 10 }}>{pwBusy ? 'Ukládám…' : 'Nastavit heslo'}</button>
            </form>
          </div>

          <div style={{ borderTop: '1px dashed var(--paper-line)', marginTop: 20, paddingTop: 16 }}>
            <label className="field-label" style={{ marginTop: 0 }}>Statistiky se počítají od</label>
            <p className="help-note">
              Výpravy před tímhle datem appka ve Statistikách schová pod "Historie" — čísla úspěšnosti
              tam totiž nemusí být přesná (typicky proto, že staré neúspěšné výpravy appka nemá zpětně
              zapsané). Výchozí je den založení skupiny, klidně to posuň, pokud appku party reálně
              začala používat později.
            </p>
            <form onSubmit={handleSaveStatsSince}>
              <input
                className="text-input" type="date"
                value={statsSince} onChange={(e) => setStatsSinceInput(e.target.value)}
                style={{ marginTop: 4 }}
              />
              {statsSinceError && <p className="error-text">{statsSinceError}</p>}
              {statsSinceMessage && <p className="hint-text" style={{ marginTop: 8 }}>{statsSinceMessage}</p>}
              <button className="new-btn" type="submit" disabled={statsSinceBusy} style={{ marginTop: 10 }}>{statsSinceBusy ? 'Ukládám…' : 'Uložit'}</button>
            </form>
          </div>
      </div>
    </>
  )
}

function RodEditRow({ rod, color, baitPhotoMap = {}, baitListId = 'known-baits-all', baitCatalog = [], baitCategory = null, onAddBait, onBackfillBaitPhoto, onArmPosition, onDone, onCancel, onDeleteRod, deleteLabel = 'prut', hidePosition = false }) {
  const [name, setName] = useState(rod.name)
  const initialBaits = (rod.baits && rod.baits.length > 0)
    ? rod.baits.map((b) => ({ name: b.name, photo_url: b.photo_url, photoFile: null }))
    : (rod.bait ? [{ name: rod.bait, photo_url: rod.bait_photo_url, photoFile: null }] : [{ name: '', photo_url: null, photoFile: null }])
  const [baits, setBaits] = useState(initialBaits)
  const [busy, setBusy] = useState(false)

  function updateBait(i, field, value) {
    setBaits((prev) => {
      const next = [...prev]
      let entry = { ...next[i], [field]: value }
      if (field === 'name' && !entry.photoFile) {
        const match = baitPhotoMap[value.trim().toLowerCase()]
        if (match) entry.photo_url = match
      }
      next[i] = entry
      return next
    })
  }
  function addBait() { setBaits((prev) => [...prev, { name: '', photo_url: null, photoFile: null }]) }
  function removeBait(i) { setBaits((prev) => prev.filter((_, idx) => idx !== i)) }

  async function handleSave() {
    setBusy(true)
    const baitsPayload = []
    for (const b of baits) {
      if (!b.name && !b.photo_url && !b.photoFile) continue
      let photo_url = b.photo_url
      let photo_thumb_url = b.photo_thumb_url
      if (b.photoFile) {
        const uploaded = await uploadPhoto(b.photoFile, `baits/${rod.session_id}`)
        if (uploaded) {
          photo_url = uploaded.url
          photo_thumb_url = uploaded.thumbUrl
          onBackfillBaitPhoto?.(b.name, photo_url, photo_thumb_url)
        }
      }
      baitsPayload.push({ name: b.name, photo_url, photo_thumb_url })
    }
    const { error } = await supabase.from('rods').update({
      name, baits: baitsPayload,
      bait: baitsPayload.map((b) => b.name).filter(Boolean).join(', ') || null,
    }).eq('id', rod.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone()
  }

  async function handleDelete() {
    if (!window.confirm(`Opravdu smazat ${deleteLabel} „${rod.name}“? Nedá se to vrátit zpět.`)) return
    setBusy(true)
    const { error } = await supabase.from('rods').delete().eq('id', rod.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    onDeleteRod ? onDeleteRod() : onDone()
  }

  return (
    <div className="rod-edit-block">
      {!hidePosition && <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />}
      {baits.map((b, i) => (
        <div key={i} className="bait-edit-row">
          <BaitPicker
            value={b.name}
            category={baitCategory}
            catalog={baitCatalog}
            onChange={(name) => updateBait(i, 'name', name)}
            onAddBait={onAddBait}
            placeholder="nástraha"
          />
          <label className="photo-label">
            <IconCamera size={13} />{' '}{b.photoFile ? b.photoFile.name : (b.photo_url ? 'změnit' : 'foto')}
            <input type="file" accept="image/*" hidden onChange={(e) => updateBait(i, 'photoFile', e.target.files[0])} />
          </label>
          {b.photo_url && !b.photoFile && <img src={b.photo_url} alt="" className="bait-thumb" />}
          {baits.length > 1 && <button type="button" className="ticket-close" style={{ position: 'static', color: 'var(--ink-soft)' }} onClick={() => removeBait(i)}><IconClose size={16} /></button>}
        </div>
      ))}
      <button type="button" className="new-btn" onClick={addBait} style={{ marginTop: 4 }}>+ další nástraha</button>
      {!hidePosition && (
        <div className="rod-edit-row" style={{ marginTop: 8 }}>
          <button type="button" className="new-btn" onClick={onArmPosition}><IconRevir size={13} /> změnit pozici na mapě</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="new-btn" onClick={onCancel}>Zrušit</button>
        <button className="new-btn danger-btn" onClick={handleDelete} disabled={busy}><IconTrash size={13} /> Smazat {deleteLabel}</button>
        <button className="btn-primary" style={{ margin: 0 }} onClick={handleSave} disabled={busy}>{busy ? 'Ukládám…' : 'Uložit'}</button>
      </div>
    </div>
  )
}

function SessionFormPanel({ draft, setDraft, onArmRod, onSave, onClose, baitPhotoMap = {}, baitListId = 'known-baits-all', baitCatalog = [], baitCategory = null, onAddBait, onStartAddArea, locationsCatalog = [], onSaveLocation, onPersistStation, onZoomToPoint }) {
  useLockBodyScroll()
  const [busy, setBusy] = useState(false)
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherError, setWeatherError] = useState(null)
  const [showManualWeather, setShowManualWeather] = useState(false)
  const [stationPickerOpen, setStationPickerOpen] = useState(false)
  const [stationOptions, setStationOptions] = useState([])
  const [stationPickerBusy, setStationPickerBusy] = useState(false)

  function set(field, value) { setDraft((d) => ({ ...d, [field]: value })) }
  function setRod(i, field, value) {
    setDraft((d) => {
      const rods = [...d.rods]; rods[i] = { ...rods[i], [field]: value }
      return { ...d, rods }
    })
  }
  function addRod() {
    const label = LURE_TYPES.includes(draft.type) ? 'Místo' : 'Prut'
    const newIndex = draft.rods.length
    setDraft((d) => ({
      ...d,
      rods: [...d.rods, { name: `${label} ${d.rods.length + 1}`, lat: d.point.lat, lng: d.point.lng, baits: [{ name: '', photoFile: null }] }],
    }))
    // Rovnou zapne čekání na klik pro tenhle nový prut/místo -- jinak by
    // appka jen přidala duplicitní souřadnice bez možnosti je hned
    // změnit, a uživatel by musel kliknout na tlačítko dole ručně.
    onArmRod(newIndex)
  }
  // U přívlače appka nabízí přidání dalšího místa rovnou přes GPS (appka
  // ho nemusí ručně klikat na mapě) -- appka to hodí do stejného pole
  // rods, jen appka nedává žádnou nástrahu (ta zůstává jen jedna, u
  // prvního záznamu -- appka to tak drží konzistentně s detailem už
  // uložené výpravy, viz "Nástraha" + "Další místa" sekce tam).
  function addRodViaGps() {
    if (!navigator.geolocation) { alert('Tento prohlížeč neumí zjistit polohu.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setDraft((d) => ({
          ...d,
          rods: [...d.rods, { name: `Místo ${d.rods.length + 1}`, lat: point.lat, lng: point.lng, baits: [] }],
        }))
      },
      () => alert('Nepodařilo se zjistit polohu. Zkontroluj, že appka má povolení k lokaci.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }
  // U zpětné výpravy appka GPS nenabízí (appka totiž není fyzicky na
  // místě) -- další místo appka přidá na souřadnice hlavního bodu a rovnou
  // zapne čekání na klik na mapu, ať uživatel hned ví, kam ho přesunout.
  function addLurePlaceManual() {
    const newIndex = draft.rods.length
    setDraft((d) => ({
      ...d,
      rods: [...d.rods, { name: `Místo ${d.rods.length + 1}`, lat: d.point.lat, lng: d.point.lng, baits: [] }],
    }))
    onArmRod(newIndex)
  }
  function removeRod(index) {
    setDraft((d) => ({ ...d, rods: d.rods.filter((_, i) => i !== index) }))
  }
  function updateBait(rodIndex, baitIndex, field, value) {
    setDraft((d) => {
      const rods = [...d.rods]
      const baits = [...rods[rodIndex].baits]
      let entry = { ...baits[baitIndex], [field]: value }
      if (field === 'name' && !entry.photoFile) {
        const match = baitPhotoMap[value.trim().toLowerCase()]
        if (match) entry.photo_url = match
      }
      baits[baitIndex] = entry
      rods[rodIndex] = { ...rods[rodIndex], baits }
      return { ...d, rods }
    })
  }
  function addBait(rodIndex) {
    setDraft((d) => {
      const rods = [...d.rods]
      rods[rodIndex] = { ...rods[rodIndex], baits: [...rods[rodIndex].baits, { name: '', photoFile: null }] }
      return { ...d, rods }
    })
  }
  function removeBait(rodIndex, baitIndex) {
    setDraft((d) => {
      const rods = [...d.rods]
      rods[rodIndex] = { ...rods[rodIndex], baits: rods[rodIndex].baits.filter((_, i) => i !== baitIndex) }
      return { ...d, rods }
    })
  }

  async function handleFetchWeather() {
    if (!draft.date) { setWeatherError('Nejdřív vyplň datum.'); return }
    setWeatherBusy(true); setWeatherError(null)
    try {
      const w = await fetchWeather(draft.point.lat, draft.point.lng, draft.date, draft.timeFrom)
      setDraft((d) => ({ ...d, temp: w.temp, pressure: w.pressure, pressureTrend: w.pressureTrend, wind: w.wind, desc: w.desc }))
    } catch (e) {
      setWeatherError(e.message)
      setShowManualWeather(true)
    }
    try {
      const stations = resolveHydroStations(draft.linkedLocationIds, locationsCatalog)
      const byRevir = stations.length === 0 ? findStationsByRevir(draft.revir, locationsCatalog) : []
      const targets = stations.length > 0 ? stations : byRevir.length > 0 ? byRevir : await findNearestStations(draft.point.lat, draft.point.lng, 1, extractRiverName(draft.revir || draft.title))
      const results = (await Promise.all(targets.map(async (station) => {
        const water = await fetchWaterConditions(station.objID, draft.date, draft.timeFrom)
        return water ? { station_id: station.objID, station_name: station.name, level_cm: water.level_cm, flow_m3s: water.flow_m3s, temp_c: water.temp_c, spa_level: water.spa_level, precision: water.precision } : null
      }))).filter(Boolean)
      if (results.length > 0) {
        setDraft((d) => ({
          ...d,
          waterStations: results,
          waterLevel: results[0].level_cm, waterFlow: results[0].flow_m3s, waterTemp: results[0].temp_c,
          waterStationName: results[0].station_name, waterPrecision: results[0].precision, waterSpaLevel: results[0].spa_level,
        }))
      }
    } catch (err) {
      console.warn('ČHMÚ se nepovedlo (appka to nechá prázdné):', err)
    }
    setWeatherBusy(false)
  }

  useEffect(() => {
    if (draft.date) { handleFetchWeather() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.date])

  // Ruční oprava stanice ČHMÚ -- appka jinak vybírá stanici jen podle
  // vzdušné vzdálenosti (i s nápovědou podle řeky se občas netrefí,
  // např. u soutoků), takže appka musí dát možnost výběr přebít ručně.
  async function openStationPicker() {
    setStationPickerOpen(true)
    setStationPickerBusy(true)
    try {
      const list = await findNearestStations(draft.point.lat, draft.point.lng, 6, extractRiverName(draft.revir || draft.title))
      setStationOptions(list)
    } catch {
      setStationOptions([])
    }
    setStationPickerBusy(false)
  }

  async function pickStation(s) {
    setStationPickerOpen(false)
    setWeatherBusy(true)
    try {
      const water = await fetchWaterConditions(s.objID, draft.date, draft.timeFrom)
      setDraft((d) => ({
        ...d,
        waterStations: [{
          station_id: s.objID, station_name: s.name,
          level_cm: water?.level_cm ?? null, flow_m3s: water?.flow_m3s ?? null, temp_c: water?.temp_c ?? null,
          spa_level: water?.spa_level ?? null, precision: water?.precision ?? null,
        }],
        waterLevel: water?.level_cm ?? null, waterFlow: water?.flow_m3s ?? null, waterTemp: water?.temp_c ?? null,
        waterStationName: s.name, waterPrecision: water?.precision ?? null, waterSpaLevel: water?.spa_level ?? null,
      }))
      // Appka opravu zapamatuje pro příště (uloží ji do katalogu míst) --
      // výprava sama ještě neexistuje v appce databázi, appka tak
      // jen doplní id do linkedLocationIds -- propojení proběhne samo,
      // až appka výpravu doopravdy uloží (viz saveSession).
      if (onPersistStation) {
        const locId = await onPersistStation(draft.point, draft.title, draft.revir, draft.linkedLocationIds, s)
        if (locId) {
          setDraft((d) => ({ ...d, linkedLocationIds: [...new Set([...(d.linkedLocationIds || []), locId])] }))
        }
      }
    } catch {
      setWeatherError('Nepodařilo se natáhnout data pro vybranou stanici.')
    }
    setWeatherBusy(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await onSave()
    setBusy(false)
  }

  return (
    <div className="side-panel">
      <div className="ticket" style={{ maxWidth: 400 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
          <div className="eyebrow">Nová výprava</div>
          <h2>Zápis do deníku</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <form onSubmit={handleSubmit}>
            {draft.area ? (
              <div style={{ marginBottom: 10 }}>
                <label className="field-label" style={{ marginTop: 0 }}>Oblasti ({draft.area.length})</label>
                {draft.area.map((entry, idx) => {
                  const loc = entry.location_id ? locationsCatalog.find((l) => l.id === entry.location_id) : null
                  return (
                    <div key={idx} className="rod-edit-row" style={{ marginBottom: 4 }}>
                      <span className="hint-text" style={{ margin: 0, flex: 1 }}>{loc ? loc.name : `Oblast ${idx + 1}`} ({entry.points.length} bodů)</span>
                      <button
                        type="button" className="new-btn danger-btn"
                        onClick={() => set('area', draft.area.filter((_, i) => i !== idx))}
                      ><IconTrash size={13} /></button>
                    </div>
                  )
                })}
                <button
                  type="button" className="new-btn"
                  onClick={() => onStartAddArea((newAreas) => set('area', [...(draft.area || []), ...newAreas.map((entry) => (entry && entry.points ? entry : { location_id: null, points: entry }))]), true)}
                >+ Přidat oblast</button>
              </div>
            ) : (
              <p className="hint-text">Pozice: {draft.point.lat.toFixed(4)}, {draft.point.lng.toFixed(4)}</p>
            )}
            {draft.area && (
              <button type="button" className="new-btn" onClick={() => onSaveLocation(draft)} style={{ marginBottom: 10 }}><IconBookmark size={13} /> Uložit toto místo do katalogu</button>
            )}
            <label className="field-label">Název výpravy</label>
            <input className="text-input" required value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="např. Orlík — zátoka pod hrází" />
            <label className="field-label">Revír / lokalita</label>
            <input className="text-input" value={draft.revir} onChange={(e) => set('revir', e.target.value)} placeholder="např. Labe 19, Jizera - Kárany" />
            {LURE_TYPES.includes(draft.type) && (
              <>
                <label className="field-label">Cíl (nepovinné)</label>
                <label className="location-check-row" style={{ marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.target_species === 'Obecně dravci'}
                    onChange={(e) => set('target_species', e.target.checked ? 'Obecně dravci' : '')}
                  />
                  Obecně dravci
                </label>
                {draft.target_species !== 'Obecně dravci' && (
                  <input
                    className="text-input"
                    value={draft.target_species || ''}
                    onChange={(e) => set('target_species', e.target.value)}
                    placeholder="nebo napiš konkrétní druh…"
                    list="known-species"
                    autoComplete="off"
                  />
                )}
              </>
            )}
            <div className="input-row">
              <div className="input-row-auto">
                <label className="field-label">Datum</label>
                <input className="text-input" type="date" required value={draft.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="input-row-auto">
                <label className="field-label">Od</label>
                <input className="text-input" type="time" value={draft.timeFrom} onChange={(e) => set('timeFrom', e.target.value)} />
              </div>
              <div className="input-row-auto">
                <label className="field-label">Do</label>
                <input className="text-input" type="time" value={draft.timeTo} onChange={(e) => set('timeTo', e.target.value)} />
              </div>
            </div>

            {crossesMidnight(draft.timeFrom, draft.timeTo) && (
              <p className="hint-text">🌙 Výprava přes půlnoc — trvání {formatDurationHM(sessionDurationMinutes({ time_from: draft.timeFrom, time_to: draft.timeTo }))}.</p>
            )}

            <button type="button" className="new-btn" onClick={handleFetchWeather} disabled={weatherBusy} style={{ marginTop: 10 }}>
              {weatherBusy ? 'Zjišťuji…' : <><IconRefresh size={13} /> Doplnit podmínky automaticky</>}
            </button>
            {weatherError && <p className="error-text">{weatherError}</p>}
            {draft.waterStations?.length > 0 ? (
              draft.waterStations.map((ws) => (
                <p key={ws.station_id} className="hint-text" style={{ marginTop: 6 }}>
                  <IconDroplet size={13} color="var(--water-mid)" /> {ws.level_cm != null ? `${ws.level_cm} cm` : '—'} · {ws.flow_m3s != null ? `${ws.flow_m3s} m³/s` : '—'}
                  {ws.temp_c != null ? ` · ${ws.temp_c} °C` : ''} ({ws.station_name}{ws.precision ? `, ${WATER_PRECISION_LABEL[ws.precision]}` : ''})
                  {ws.spa_level != null && SPA_LEVEL_INFO[ws.spa_level] ? ` · ${SPA_LEVEL_INFO[ws.spa_level].icon} ${SPA_LEVEL_INFO[ws.spa_level].label}` : ''}
                </p>
              ))
            ) : draft.waterStationName && (
              <p className="hint-text" style={{ marginTop: 6 }}>
                <IconDroplet size={13} color="var(--water-mid)" /> {draft.waterLevel != null ? `${draft.waterLevel} cm` : '—'} · {draft.waterFlow != null ? `${draft.waterFlow} m³/s` : '—'}
                {draft.waterTemp != null ? ` · ${draft.waterTemp} °C` : ''} ({draft.waterStationName}{draft.waterPrecision ? `, ${WATER_PRECISION_LABEL[draft.waterPrecision]}` : ''})
                {draft.waterSpaLevel != null && SPA_LEVEL_INFO[draft.waterSpaLevel] ? ` · ${SPA_LEVEL_INFO[draft.waterSpaLevel].icon} ${SPA_LEVEL_INFO[draft.waterSpaLevel].label}` : ''}
              </p>
            )}
            {(draft.waterStations?.length > 0 || draft.waterStationName) && !stationPickerOpen && (
              <button type="button" className="new-btn" style={{ marginTop: 4 }} onClick={openStationPicker}>Změnit stanici</button>
            )}
            {stationPickerOpen && (
              <div style={{ marginTop: 6 }}>
                {stationPickerBusy && <p className="hint-text">Hledám nejbližší stanice…</p>}
                {!stationPickerBusy && stationOptions.length === 0 && <p className="hint-text">ČHМÚ nevrátilo žádné stanice.</p>}
                {!stationPickerBusy && stationOptions.map((s) => (
                  <div key={s.objID} className="bait-picker-item" onClick={() => pickStation(s)}>
                    {s.name}{s.stream ? ` (${s.stream})` : ''}
                  </div>
                ))}
                <button type="button" className="new-btn" style={{ marginTop: 4 }} onClick={() => setStationPickerOpen(false)}>Zrušit</button>
              </div>
            )}
            {draft.date && <p className="hint-text" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><IconMoonPhase phase={moonPhaseName(draft.date)} size={13} /> {moonPhaseName(draft.date)}</p>}

            <button type="button" className="new-btn" onClick={() => setShowManualWeather((v) => !v)} style={{ marginTop: 6 }}>
              {showManualWeather ? 'Skrýt ruční upřesnění' : 'Upřesnit ručně'}
            </button>
            {showManualWeather && (
              <>
                <div className="input-row" style={{ marginTop: 10 }}>
                  <div>
                    <label className="field-label">Teplota °C</label>
                    <input className="text-input" type="number" value={draft.temp} onChange={(e) => set('temp', e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Tlak hPa</label>
                    <input className="text-input" type="number" value={draft.pressure} onChange={(e) => set('pressure', e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Vítr</label>
                    <input className="text-input" value={draft.wind} onChange={(e) => set('wind', e.target.value)} placeholder="3 m/s SV" />
                  </div>
                </div>
                <label className="field-label">Popis počasí</label>
                <input className="text-input" value={draft.desc} onChange={(e) => set('desc', e.target.value)} placeholder="jasno, ráno mlha" />
              </>
            )}

            <label className="field-label">{LURE_TYPES.includes(draft.type) ? 'Nástraha' : 'Pruty'}</label>
            {draft.rods.map((r, i) => {
              const isLure = LURE_TYPES.includes(draft.type)
              if (isLure && i > 0) return null // další místa appka ukáže samostatně níž, žádná nástraha/jméno tam
              return (
                <div key={i} className="rod-edit-block">
                  {!isLure && (
                    <input className="text-input" value={r.name} onChange={(e) => setRod(i, 'name', e.target.value)} placeholder="Prut 1" style={{ marginBottom: 8 }} />
                  )}
                  {r.baits.map((b, bi) => (
                    <div key={bi} className="bait-edit-row">
                      <BaitPicker
                        value={b.name}
                        category={baitCategory}
                        catalog={baitCatalog}
                        onChange={(name) => updateBait(i, bi, 'name', name)}
                        onAddBait={onAddBait}
                        placeholder="nástraha"
                      />
                      <label className="photo-label">
                        <IconCamera size={13} />{' '}{b.photoFile ? b.photoFile.name : (b.photo_url ? 'nalezeno z historie' : 'foto')}
                        <input type="file" accept="image/*" hidden onChange={(e) => updateBait(i, bi, 'photoFile', e.target.files[0])} />
                      </label>
                      {b.photo_url && !b.photoFile && <img src={b.photo_url} alt="" className="bait-thumb" />}
                      {r.baits.length > 1 && <button type="button" className="ticket-close" style={{ position: 'static', color: 'var(--ink-soft)' }} onClick={() => removeBait(i, bi)}><IconClose size={16} /></button>}
                    </div>
                  ))}
                  <button type="button" className="new-btn" onClick={() => addBait(i)} style={{ marginTop: 4 }}>+ další nástraha</button>
                  {!isLure && (
                    <div className="rod-edit-row" style={{ marginTop: 8 }}>
                      <button type="button" className="new-btn" onClick={() => onArmRod(i)}><IconRevir size={13} /> pozice na mapě: {r.lat.toFixed(4)}, {r.lng.toFixed(4)}</button>
                    </div>
                  )}
                </div>
              )
            })}

            {LURE_TYPES.includes(draft.type) ? (
              <>
                {draft.rods.length > 1 && (
                  <div className="coord-list" style={{ marginBottom: 8 }}>
                    {draft.rods.slice(1).map((r, idx) => (
                      <div key={idx + 1} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {draft.live ? (
                          <span className="coord-chip">{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</span>
                        ) : (
                          <button type="button" className="new-btn" style={{ flex: 1 }} onClick={() => onArmRod(idx + 1)}><IconRevir size={13} /> pozice na mapě: {r.lat.toFixed(4)}, {r.lng.toFixed(4)}</button>
                        )}
                        <button type="button" className="ticket-close" style={{ position: 'static', color: 'var(--ink-soft)' }} onClick={() => removeRod(idx + 1)}><IconClose size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {draft.live ? (
                  <button type="button" className="new-btn" onClick={addRodViaGps} style={{ marginBottom: 12 }}>+ Další bod pomocí GPS</button>
                ) : (
                  <button type="button" className="new-btn" onClick={addLurePlaceManual} style={{ marginBottom: 12 }}>+ Přidat další místo</button>
                )}
              </>
            ) : (
              <button type="button" className="new-btn" onClick={addRod} style={{ marginBottom: 12 }}>+ další prut</button>
            )}

            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit výpravu'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}

function CatchFormPanel({ draft, setDraft, rods, session, onSave, onClose, baitPhotoMap = {}, baitListId = 'known-baits-all', baitCatalog = [], baitCategory = null, onAddBait, locationsCatalog = [] }) {
  const [busy, setBusy] = useState(false)
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherError, setWeatherError] = useState(null)
  function set(field, value) { setDraft((d) => ({ ...d, [field]: value })) }

  function handleBaitChange(value) {
    setDraft((d) => {
      const next = { ...d, bait: value }
      if (!d.baitPhotoFile) {
        const match = baitPhotoMap[value.trim().toLowerCase()]
        if (match) next.bait_photo_url = match
      }
      return next
    })
  }

  async function handleFetchWeather() {
    if (!draft.time) { setWeatherError('Nejdřív vyplň čas úlovku.'); return }
    setWeatherBusy(true); setWeatherError(null)
    // U výpravy přes půlnoc appka spočítá skutečné datum úlovku
    // (čas menší než začátek výpravy appka bere jako "už příští den"),
    // ať appka dohledá počasí/vodu pro správný kalendářní den, ne pro
    // den, kdy výprava jen začala.
    const catchDate = actualDateForTime(session.session_date, session.time_from, draft.time)
    try {
      const w = await fetchWeather(draft.point.lat, draft.point.lng, catchDate, draft.time)
      setDraft((d) => ({ ...d, weather_temp_c: w.temp, weather_pressure_hpa: w.pressure, weather_pressure_trend: w.pressureTrend, weather_wind: w.wind, weather_desc: w.desc }))
    } catch (e) {
      setWeatherError(e.message)
    }
    try {
      const linkedIds = (session.session_locations || []).map((sl) => sl.location_id)
      const linkedStation = resolveHydroStation(linkedIds, locationsCatalog)
      const byRevir = !linkedStation ? findStationsByRevir(draft.revir || session.revir, locationsCatalog) : []
      const station = linkedStation || byRevir[0] || (await findNearestStations(draft.point.lat, draft.point.lng, 1, extractRiverName(draft.revir || session.revir || session.title)))[0]
      if (station) {
        const water = await fetchWaterConditions(station.objID, catchDate, draft.time)
        if (water) {
          setDraft((d) => ({
            ...d,
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

  useEffect(() => {
    if (draft.time) { handleFetchWeather() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.time])

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await onSave()
    setBusy(false)
  }

  return (
    <div className="side-panel">
      <div className="ticket" style={{ maxWidth: 380 }}>
        <div className="ticket-top">
          <button className="ticket-close" onClick={onClose}><IconClose size={16} /></button>
          <div className="eyebrow">Nový úlovek</div>
          <h2>Zapsat rybu</h2>
        </div>
        <div className="perforation"></div>
        <div className="ticket-body">
          <form onSubmit={handleSubmit}>
            <p className="hint-text">Pozice: {draft.point.lat.toFixed(4)}, {draft.point.lng.toFixed(4)}</p>
            <label className="field-label">Druh ryby</label>
            <input className="text-input" required value={draft.species} onChange={(e) => set('species', e.target.value)} placeholder="Kapr obecný" />
            <label className="field-label">Revír / lokalita</label>
            <input className="text-input" value={draft.revir} onChange={(e) => set('revir', e.target.value)} placeholder="např. Labe 19" />
            <label className="field-label">Kategorie</label>
            <select className="text-input" value={draft.category} onChange={(e) => set('category', e.target.value)}>
              <option value="dravec">Dravec</option>
              <option value="bila">Bílá ryba</option>
            </select>
            <div className="input-row">
              <div>
                <label className="field-label">Délka (cm)</label>
                <input className="text-input" type="number" value={draft.length} onChange={(e) => set('length', e.target.value)} />
              </div>
              <div>
                <label className="field-label">Váha (kg)</label>
                <input className="text-input" type="number" step="0.1" value={draft.weight} onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value, weightEstimated: false }))} />
              </div>
              <div className="input-row-auto">
                <label className="field-label">Čas</label>
                <input className="text-input" type="time" value={draft.time} onChange={(e) => set('time', e.target.value)} />
              </div>
            </div>
            {!draft.weight && draft.length && hasWeightEstimate(draft.species) && estimateWeightKg(draft.species, draft.length) != null && (
              <p className="hint-text" style={{ marginTop: -6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <IconApprox size={14} /> Odhad z délky: {estimateWeightKg(draft.species, draft.length)} kg
                <button type="button" className="new-btn" style={{ marginLeft: 4 }} onClick={() => setDraft((d) => ({ ...d, weight: estimateWeightKg(draft.species, draft.length), weightEstimated: true }))}>
                  Použít
                </button>
              </p>
            )}
            <button type="button" className="new-btn" onClick={handleFetchWeather} disabled={weatherBusy} style={{ marginBottom: 8 }}>
              {weatherBusy ? 'Zjišťuji…' : <><IconRefresh size={13} /> Dopočítat podmínky pro tento čas</>}
            </button>
            {weatherError && <p className="error-text">{weatherError}</p>}
            {draft.weather_temp_c != null && (
              <p className="hint-text" style={{ marginBottom: 6 }}>
                {draft.weather_temp_c}°C · {draft.weather_pressure_hpa} hPa · {draft.weather_wind} · {draft.weather_desc}
              </p>
            )}
            {draft.water_station_name && (
              <p className="hint-text" style={{ marginBottom: 10 }}>
                <IconDroplet size={13} color="var(--water-mid)" /> {draft.water_level_cm != null ? `${draft.water_level_cm} cm` : '—'} · {draft.water_flow_m3s != null ? `${draft.water_flow_m3s} m³/s` : '—'}
                {draft.water_temp_c != null ? ` · ${draft.water_temp_c} °C` : ''} ({draft.water_station_name}{draft.water_data_precision ? `, ${WATER_PRECISION_LABEL[draft.water_data_precision]}` : ''})
              </p>
            )}
            <label className="field-label">Nástraha</label>
            <BaitPicker
              value={draft.bait}
              category={baitCategory}
              catalog={baitCatalog}
              onChange={handleBaitChange}
              onAddBait={onAddBait}
              placeholder="boilie tuňák 20mm"
            />
            <label className="photo-label" style={{ display: 'inline-block', marginTop: 4, marginRight: 8 }}>
              <IconCamera size={13} />{' '}{draft.baitPhotoFile ? draft.baitPhotoFile.name : (draft.bait_photo_url ? 'nalezeno z historie' : 'foto nástrahy')}
              <input type="file" accept="image/*" hidden onChange={(e) => set('baitPhotoFile', e.target.files[0])} />
            </label>
            {draft.bait_photo_url && !draft.baitPhotoFile && <img src={draft.bait_photo_url} alt="" className="bait-thumb" />}
            <label className="field-label">Foto úlovku</label>
            <label className="photo-label" style={{ display: 'inline-block', marginTop: 4 }}>
              <IconCamera size={13} />{' '}{draft.photoFile ? draft.photoFile.name : 'vybrat foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => set('photoFile', e.target.files[0])} />
            </label>
            <br />
            {rods.length > 0 && !LURE_TYPES.includes(session?.type) && (
              <>
                <label className="field-label">Prut</label>
                <select className="text-input" value={draft.rodId} onChange={(e) => set('rodId', e.target.value)}>
                  <option value="">— nevybráno —</option>
                  {rods.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </>
            )}
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit úlovek'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
