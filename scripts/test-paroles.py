#!/usr/bin/env python3.13
"""Test décisif : un morceau importé SANS paroles intégrées doit avoir ses paroles."""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4199/"
OUT = Path("/tmp/opencode")
SAMPLE = "/mnt/sdcard/Download/parisienne-clip-officiel.mp3"

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
options.set_preference("media.autoplay.default", 0)
service = Service(executable_path="/tmp/opencode/geckodriver")
driver = webdriver.Firefox(options=options, service=service)
driver.set_window_size(1280, 800)

try:
    driver.get(BASE)
    time.sleep(4)
    inputs = driver.find_elements(By.CSS_SELECTOR, 'input[type="file"]')
    inputs[0].send_keys(SAMPLE)
    time.sleep(9)

    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        if "PARISIENNE" in (element.text or ""):
            driver.execute_script("arguments[0].click();", element)
            break
    time.sleep(5)
    # Si le lecteur n'est pas ouvert, on l'ouvre via la carte « En cours ».
    opened = driver.execute_script(
        """
        const section = document.querySelector('section.fixed.inset-0.z-40');
        return !!section;
        """
    )
    if not opened:
        print("lecteur non ouvert automatiquement, ouverture manuelle", flush=True)
        driver.execute_script(
            """
            const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('EN COURS'));
            if(b) b.click();
            """
        )
        time.sleep(3)
    time.sleep(8)
    driver.save_screenshot(str(OUT / "par-1-paroles.png"))

    body = driver.execute_script("return document.body.innerText")
    print("---- texte affiché ----")
    print(body[:700])
    print("-----------------------")

    lyrics_found = "Paroles en cours" in body or "indisponibles" in body
    print("état des paroles :", "INDISPONIBLES" if "indisponibles" in body else ("EN COURS" if lyrics_found else "PRÊTES"))
    if "indisponibles" in body:
        print("ECHEC : aucune parole")
        sys.exit(1)
finally:
    driver.quit()
