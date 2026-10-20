#!/usr/bin/env python3.13
"""Test d'acceptation : UI, import, paroles, capsules, file famille."""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4199/"
OUT = Path("/tmp/opencode")
SAMPLE = "/mnt/sdcard/Download/Mirage.mp3"

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
options.set_preference("media.autoplay.default", 0)
options.set_preference("media.block-autoplay-until-in-foreground", False)
service = Service(executable_path="/tmp/opencode/geckodriver")
driver = webdriver.Firefox(options=options, service=service)
driver.set_window_size(1280, 800)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'OK ' if ok else 'KO '}] {name} {detail}", flush=True)


def click_text(text, exact=False):
    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        content = (element.text or "").strip()
        if (content == text) if exact else (text.lower() in content.lower()):
            driver.execute_script("arguments[0].click();", element)
            return True
    return False


def click_aria(label):
    for element in driver.find_elements(By.CSS_SELECTOR, f'button[aria-label="{label}"]'):
        driver.execute_script("arguments[0].click();", element)
        return True
    return False


try:
    driver.get(BASE)
    time.sleep(4)

    # --- 1. Import ------------------------------------------------------
    inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
    check("champ d'import présent", len(inputs) > 0)
    inputs[0].send_keys(SAMPLE)
    time.sleep(8)
    body = driver.execute_script("return document.body.innerText")
    check("morceau importé visible", "Mirage" in body)

    # --- 2. LECTURE + PAROLES ------------------------------------------
    click_text("Mirage")
    time.sleep(7)
    driver.save_screenshot(str(OUT / "acc-1-lecteur.png"))

    audio = driver.execute_script(
        """
        const a = window.__vitrailAudio;
        return a ? { paused: a.paused, t: a.currentTime, ready: a.readyState, src: (a.currentSrc||'').slice(0,30) } : null;
        """
    )
    check("le son joue", audio and not audio["paused"] and audio["t"] > 0, str(audio))

    body = driver.execute_script("return document.body.innerText")
    lyrics_visible = "Encore une fois" in body or "Ouais" in body or "Je sais" in body
    check("paroles affichées", lyrics_visible)

    # --- 3. UI : pas de chevauchement mini-lecteur / nav ----------------
    click_aria("Réduire")
    time.sleep(2)
    geometry = driver.execute_script(
        """
        const nav = [...document.querySelectorAll('nav')][0];
        const dock = nav ? nav.parentElement : null;
        const mini = dock ? [...dock.children].find(c => c !== nav && (c.className||'').toString().includes('glass-sheen')) : null;
        if (!mini || !nav) return null;
        const a = mini.getBoundingClientRect(), b = nav.getBoundingClientRect();
        return { miniBottom: a.bottom, miniTop: a.top, navTop: b.top, navBottom: b.bottom, overlap: a.bottom > b.top + 1 };
        """
    )
    check("pas de chevauchement mini-lecteur/nav", geometry and not geometry["overlap"], str(geometry))
    driver.save_screenshot(str(OUT / "acc-4-dock.png"))

    # --- 4. CAPSULES ----------------------------------------------------
    driver.execute_script(
        """
        const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Capsules');
        if(b) b.click();
        """
    )
    time.sleep(3)
    driver.save_screenshot(str(OUT / "acc-2-capsules.png"))
    body = driver.execute_script("return document.body.innerText")
    check("capsules affichées", "d" in body and ("écoute" in body.lower() or "Écouté" in body))

    # --- 5. FILE FAMILLE ------------------------------------------------
    driver.execute_script(
        """
        const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='File');
        if(b) b.click();
        """
    )
    time.sleep(4)
    driver.save_screenshot(str(OUT / "acc-3-file-famille.png"))
    body = driver.execute_script("return document.body.innerText")
    check("file famille présente", "famille" in body.lower())
    check("service local détecté", "Service de la famille injoignable" not in body)

finally:
    driver.quit()

print("\n--- BILAN ---")
ok = sum(1 for _, passed, _ in results if passed)
print(f"{ok}/{len(results)} vérifications passées")
for name, passed, detail in results:
    if not passed:
        print(f"  KO : {name} {detail}")
sys.exit(0 if ok == len(results) else 1)
