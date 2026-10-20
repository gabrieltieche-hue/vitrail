#!/usr/bin/env python3.13
"""Capture les deux thèmes (clair et sombre) de l'app."""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4199/"
OUT = Path("/tmp/opencode")

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
options.set_preference("media.autoplay.default", 0)
driver = webdriver.Firefox(options=options, service=Service(executable_path="/tmp/opencode/geckodriver"))
driver.set_window_size(1280, 800)

try:
    driver.get(BASE)
    time.sleep(4)
    driver.save_screenshot(str(OUT / "theme-1-sombre.png"))
    print("  -> theme-1-sombre.png", flush=True)

    # Bascule en clair via le bouton de thème.
    for element in driver.find_elements(By.CSS_SELECTOR, 'button[aria-label*="thème clair"]'):
        driver.execute_script("arguments[0].click();", element)
        break
    time.sleep(2)
    driver.save_screenshot(str(OUT / "theme-2-clair.png"))
    print("  -> theme-2-clair.png", flush=True)

    is_light = driver.execute_script("return document.documentElement.classList.contains('light')")
    print("  classe light appliquée :", is_light, flush=True)

    # Lecteur en clair
    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        if "Let It In" in (element.text or ""):
            driver.execute_script("arguments[0].click();", element)
            break
    time.sleep(5)
    driver.save_screenshot(str(OUT / "theme-3-clair-lecteur.png"))
    print("  -> theme-3-clair-lecteur.png", flush=True)
finally:
    driver.quit()
