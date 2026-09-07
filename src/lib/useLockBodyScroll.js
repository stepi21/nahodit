import { useEffect } from 'react'

// Zamkne scrollovani cele stranky (html/body), zatimco je otevreny
// nejaky celoobrazovkovy panel (ulovkovy listek, nova/ziva vyprava,
// editace vypravy). Bez tohoto na iOS Safari fixni ("position:fixed")
// panel jen VIZUALNE zakryje obrazovku, ale dotykem se dá dal scrollovat
// stranka POD nim (schovana, ale porad aktivni) -- to zpusobovalo pocit,
// ze se panel "zasekava" nebo je "prikotveny" k horni liste, protoze se
// ve skutecnosti hybalo neco jineho, ne panel samotny.
//
// Pouziti: v komponente panelu jen zavolej useLockBodyScroll() -- zamkne
// se pri prvnim vykresleni, odemkne se pri zavreni/zmizeni panelu.
//
// Appka drzi pocet aktivne "zamykajicich" panelu v modulove promenne
// (LOCK_COUNT) -- kdyz appka na sebe naskladá dva panely najednou
// (typicky: nedopatřením zůstane pod appkou vykreslený i předchozí
// panel, co se ještě nestihl odmountovat), KAŽDÝ z nich dřív při svém
// zavření appku odemkl -- i když ten druhý appku pořád potřeboval
// zamčenou. Appka pak nechala tělo stránky v "position:fixed" bez
// vizuálního panelu nad tím, což na dotyk vypadalo jako appka "nereaguje
// na kliky" (klik dopadl na zamčené neviditelné tělo stránky, ne na
// tlačítko pod prstem). Appka teď zamyká/odemyká jen při přechodu
// 0→1 a 1→0 -- vnořené/souběžné panely appce sdílí jeden zámek.
let LOCK_COUNT = 0
let SAVED_STYLE = null
let SAVED_SCROLL_Y = 0

export function useLockBodyScroll() {
  useEffect(() => {
    const body = document.body
    if (LOCK_COUNT === 0) {
      SAVED_SCROLL_Y = window.scrollY
      SAVED_STYLE = {
        position: body.style.position, top: body.style.top,
        width: body.style.width, overflow: body.style.overflow,
      }
      body.style.position = 'fixed'
      body.style.top = `-${SAVED_SCROLL_Y}px`
      body.style.width = '100%'
      body.style.overflow = 'hidden'
    }
    LOCK_COUNT += 1

    return () => {
      LOCK_COUNT -= 1
      if (LOCK_COUNT > 0) return // appka drzi zamek dal -- jiny panel ho pořád potřebuje
      body.style.position = SAVED_STYLE.position
      body.style.top = SAVED_STYLE.top
      body.style.width = SAVED_STYLE.width
      body.style.overflow = SAVED_STYLE.overflow
      window.scrollTo(0, SAVED_SCROLL_Y)
      SAVED_STYLE = null
      // Appka na Mapě (a jiném "plovoucím" layoutu) vynucuje na .app
      // pevné min-height:100dvh (viz styles.css), ať appka na krátkém
      // obsahu (prázdná mapa) pořád sahá přesně na doraz obrazovky.
      // Přesně tahle hodnota se po přepnutí <body> na position:fixed a
      // zpět na WebKitu (Safari/Android) občas "zatuchne" -- prohlížeč
      // použije starou velikost viewportu, dokud ho něco nedonutí
      // přepočítat. Projevuje se to jako kousek podkladové barvy navíc
      // pod spodní lištou. Na Domů/Úlovcích appka žádné takové vynucené
      // min-height nemá (obsah jen přirozeně scrolluje), takže se tam
      // stejná neshoda ztratí v běžném scrollu -- appka to tam dřív
      // považovala za "vyřešené", ve skutečnosti šlo jen o to, že to
      // nešlo vidět.
      //
      // Oprava: appka na okamžik zruší inline min-height na .app a hned
      // ho vrátí zpátky na prázdnou hodnotu -- to donutí WebKit
      // přepočítat CSS pravidlo (100dvh) úplně od začátku, s aktuálním
      // (už odemčeným) viewportem, místo aby appka jela se starou
      // zapamatovanou hodnotou.
      const appEl = document.querySelector('.app')
      if (appEl) {
        appEl.style.minHeight = '0px'
        void appEl.offsetHeight // vynutit synchronní přepočet layoutu
        appEl.style.minHeight = ''
      }
    }
  }, [])
}
