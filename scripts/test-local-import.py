#!/usr/bin/env python3.13
"""Teste l'import de fichiers personnels et leur lecture."""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4199/"
SAMPLE = "/mnt/sdcard/Download/Mirage.mp3"
OUT = Path("/tmp/opencode")

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
# Un clic scripté n'est pas un « geste utilisateur » : Firefox bloquerait
# l'autoplay. On l'autorise pour le test.
options.set_preference("media.autoplay.default", 0)
options.set_preference("media.block-autoplay-until-in-foreground", False)
service = Service(executable_path="/tmp/opencode/geckodriver")
driver = webdriver.Firefox(options=options, service=service)
driver.set_window_size(1280, 800)

try:
    driver.get(BASE)
    time.sleep(4)

    inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
    print("champs de fichier trouvés:", len(inputs), flush=True)
    inputs[0].send_keys(SAMPLE)
    time.sleep(8)

    driver.save_screenshot(str(OUT / "vitrail-local-1-import.png"))
    print("  -> capture import", flush=True)

    # Lancer le morceau importé
    clicked = False
    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        text = element.text or ""
        if "Mirage" in text:
            driver.execute_script("arguments[0].click();", element)
            clicked = True
            break
    print("  morceau importé cliqué:", clicked, flush=True)
    time.sleep(6)
    driver.save_screenshot(str(OUT / "vitrail-local-2-lecture.png"))
    print("  -> capture lecture", flush=True)

    audio = driver.execute_script(
        """
        const a = window.__vitrailAudio;
        if (!a) return { found: false };
        return {
          found: true, currentTime: a.currentTime, paused: a.paused,
          readyState: a.readyState, duration: a.duration,
          src: (a.currentSrc || a.src || '').slice(0, 40),
        };
        """
    )
    print("  audio:", audio, flush=True)

    # L'état de l'interface : erreurs visibles ?
    body = driver.execute_script("return document.body.innerText")
    print("  mentions d'erreur:", [w for w in ("indisponible", "impossible", "erreur") if w in body.lower()], flush=True)
finally:
    driver.quit()
