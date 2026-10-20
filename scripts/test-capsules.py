#!/usr/bin/env python3.13
"""Vérifie l'historique d'écoute et le rendu des capsules."""
import json
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
service = Service(executable_path="/tmp/opencode/geckodriver")
driver = webdriver.Firefox(options=options, service=service)
driver.set_window_size(1280, 800)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'OK ' if ok else 'KO '}] {name} {detail}", flush=True)


def click_text(text):
    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        if text.lower() in (element.text or "").lower():
            driver.execute_script("arguments[0].click();", element)
            return True
    return False


def open_capsules():
    driver.execute_script(
        """
        const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Capsules');
        if(b) b.click();
        """
    )
    time.sleep(3)


try:
    driver.get(BASE)
    time.sleep(4)

    # --- Enregistrement réel d'une écoute -------------------------------
    inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
    inputs[0].send_keys(SAMPLE)
    time.sleep(8)
    click_text("Mirage")
    time.sleep(5)
    # On avance dans le morceau pour dépasser le seuil de 10 s.
    driver.execute_script("window.__vitrailAudio.currentTime = 45")
    time.sleep(17)
    # Pause : l'écoute doit être Recorded immédiatement.
    driver.execute_script("window.__vitrailAudio.pause()")
    time.sleep(2)

    history = driver.execute_script(
        "return JSON.parse(localStorage.getItem('vitrail_history_v1') || '{\"events\":[]}')"
    )
    check("écoute enregistrée", len(history.get("events", [])) > 0, str(history.get("events", [])[:1]))

    # --- Rendu des capsules avec un historique garni ---------------------
    driver.execute_script(
        """
        const now = Date.now();
        const events = [];
        const tracks = [
          ['t1','Mirage','gabriel_tieche','Ma bibliothèque'],
          ['t2','Par共同的','GIMS','La Melodía'],
          ['t3','N туца','Stromae','Multitude'],
          ['t4','Mirage','gabriel_tieche','Ma bibliothèque'],
        ];
        for (let d = 6; d >= 0; d--) {
          for (let i = 0; i < (7 - d); i++) {
            const t = tracks[i % tracks.length];
            events.push({ id: t[0], title: t[1], artist: t[2], album: t[3], artwork: '', source: 'local',
                          seconds: 120 + i * 30, at: now - d * 86400000 - i * 3600000 });
          }
        }
        localStorage.setItem('vitrail_history_v1', JSON.stringify({ events }));
        """
    )
    driver.get(BASE)
    time.sleep(4)
    open_capsules()
    driver.save_screenshot(str(OUT / "cap-1-capsules.png"))
    body = driver.execute_script("return document.body.innerText")
    check("temps d'écoute affiché", "d'écoute" in body, body[:60].replace("\n", " "))
    check("morceaux listés", "Mirage" in body)
    check("artistes listés", "GIMS" in body or "gabriel_tieche" in body)
    check("graphe sur 7 jours", body.count("\n") > 5)

    # --- File famille ----------------------------------------------------
    driver.execute_script(
        """
        const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='File');
        if(b) b.click();
        """
    )
    time.sleep(4)
    driver.save_screenshot(str(OUT / "cap-2-file.png"))
    body = driver.execute_script("return document.body.innerText")
    check("file famille affichée", "famille" in body.lower())
    check("service joignable", "injoignable" not in body)

finally:
    driver.quit()

print("\n--- BILAN ---")
ok = sum(1 for _, passed, _ in results if passed)
print(f"{ok}/{len(results)} vérifications passées")
for name, passed, detail in results:
    if not passed:
        print(f"  KO : {name} {detail}")
sys.exit(0 if ok == len(results) else 1)
