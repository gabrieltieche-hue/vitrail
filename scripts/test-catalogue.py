#!/usr/bin/env python3.13
"""Test : recherche dans le catalogue, puis lecture en flux depuis le service."""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8099/"
OUT = Path("/tmp/opencode")

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
options.set_preference("media.autoplay.default", 0)
driver = webdriver.Firefox(options=options, service=Service(executable_path="/tmp/opencode/geckodriver"))
driver.set_window_size(1280, 800)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'OK ' if ok else 'KO '}] {name} {detail}", flush=True)


try:
    driver.get(BASE)
    time.sleep(5)

    # --- recherche -------------------------------------------------------
    boxes = driver.find_elements(By.CSS_SELECTOR, 'input[type="search"]')
    check("champ de recherche présent", len(boxes) > 0, f"({len(boxes)})")
    box = boxes[0]
    box.clear()
    box.send_keys("dadju")
    time.sleep(3)

    rows = driver.find_elements(By.CSS_SELECTOR, "ul li")
    titles = []
    for row in rows:
        text = (row.text or "").strip().replace("\n", " | ")
        if text:
            titles.append(text)
    check("résultats affichés", len(titles) > 0, f"{len(titles)} lignes")
    print("      " + "\n      ".join(titles[:4]), flush=True)
    driver.save_screenshot(str(OUT / "cat-1-recherche.png"))

    # --- pochettes -------------------------------------------------------
    images = driver.find_elements(By.CSS_SELECTOR, "ul li img")
    with_art = [img for img in images if img.get_attribute("src") and "mzstatic" in (img.get_attribute("src") or "")]
    check("pochettes trouvées", len(with_art) > 0, f"{len(with_art)} pochettes iTunes")

    # --- lecture ---------------------------------------------------------
    # On joue un morceau DÉJÀ présent (pas une proposition à télécharger).
    clicked = False
    for row in driver.find_elements(By.CSS_SELECTOR, "ul li"):
        buttons = row.find_elements(By.CSS_SELECTOR, "button")
        # Un morceau deja disponible n'a qu'un bouton (ecouter) ; une
        # proposition a en plus un bouton « Telecharger ».
        if len(buttons) != 1:
            continue
        driver.execute_script("arguments[0].click();", buttons[0])
        clicked = True
        break
    check("morceau lancé", clicked)
    time.sleep(8)

    audio = driver.execute_script(
        """
        const a = window.__vitrailAudio;
        return a ? { paused: a.paused, t: a.currentTime, ready: a.readyState, src: a.currentSrc || a.src } : null;
        """
    )
    check("flux en lecture", audio and not audio["paused"] and audio["t"] > 0, str(audio)[:150])
    check("flux servi par le service", audio and "/api/stream/" in (audio["src"] or ""), (audio or {}).get("src", "")[:70])
    driver.save_screenshot(str(OUT / "cat-2-lecture.png"))

finally:
    driver.quit()

print("\n--- BILAN ---")
ok = sum(1 for _, passed, _ in results if passed)
print(f"{ok}/{len(results)} vérifications passées")
for name, passed, detail in results:
    if not passed:
        print(f"  KO : {name} {detail}")
sys.exit(0 if ok == len(results) else 1)
