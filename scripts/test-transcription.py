#!/usr/bin/env python3.13
"""Test long : un morceau sans paroles intégrées doit être transcrit puis affiché.

Le fichier de test est une copie de Mirage.mp3 dont les balises ID3 ont été
supprimées par ffmpeg : ni paroles intégrées, ni correspondance possible
dans LRCLIB. Le seul chemin qui reste est la transcription locale.
"""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099/"
OUT = Path("/tmp/opencode")
SAMPLE = "/tmp/opencode/mirage-sans-paroles.mp3"
EXPECTED = ["mirage", "perdu le contrôle"]

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
options.set_preference("media.autoplay.default", 0)
service = Service(executable_path="/tmp/opencode/geckodriver")
driver = webdriver.Firefox(options=options, service=service)
driver.set_window_size(1280, 800)


def lyrics_panel_text():
    return driver.execute_script(
        """
        const section = document.querySelector('section.fixed.inset-0.z-40');
        return section ? section.innerText : '';
        """
    )


try:
    driver.get(BASE)
    time.sleep(4)
    inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
    inputs[0].send_keys(SAMPLE)
    time.sleep(9)

    # On clique le morceau importé (titre = nom de fichier, sans métadonnées).
    clicked = False
    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        if "mirage-sans-paroles" in (element.text or "").lower():
            driver.execute_script("arguments[0].click();", element)
            clicked = True
            break
    print("morceau importé cliqué :", clicked, flush=True)
    time.sleep(6)

    text = lyrics_panel_text().lower()
    print("état initial :", "TRANSCRIPTION" if "cours de calcul" in text else ("PAROLES" if text else "LECTEUR FERMÉ"), flush=True)
    driver.save_screenshot(str(OUT / "trans-1-debut.png"))

    found = False
    for i in range(100):
        time.sleep(5)
        text = lyrics_panel_text().lower()
        if "cours de calcul" in text:
            if i % 4 == 0:
                print(f"  [{i*5}s] transcription en cours…", flush=True)
            continue
        if "perdu le contrôle" in text or "j'ai perdu" in text:
            found = True
            print(f"  [{i*5}s] paroles transcrites affichées", flush=True)
            break
        if i % 4 == 0:
            print(f"  [{i*5}s] en attente…", flush=True)
    driver.save_screenshot(str(OUT / "trans-2-final.png"))

    print("PAROLES TRANSCRITES :", "OUI" if found else "NON", flush=True)
    if found:
        print("---- extrait ----")
        print(lyrics_panel_text()[:400])
    sys.exit(0 if found else 1)
finally:
    driver.quit()
