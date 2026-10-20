#!/usr/bin/env python3.13
"""Capture visuelle de Vitrail via Selenium + geckodriver (Firefox headless)."""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4199/"
OUT = Path("/tmp/opencode")
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = {
    "tablette": (1280, 800),
    "portable": (900, 1200),
    "phone": (430, 900),
}


def build(width: int, height: int) -> webdriver.Firefox:
    options = Options()
    options.add_argument("-headless")
    options.binary_location = "/tmp/opencode/firefox/firefox"
    options.set_preference("media.autoplay.default", 0)
    options.set_preference("dom.webnotifications.enabled", False)
    service = Service(executable_path="/tmp/opencode/geckodriver")
    driver = webdriver.Firefox(options=options, service=service)
    driver.set_window_size(width, height)
    return driver


def shoot(driver: webdriver.Firefox, name: str) -> Path:
    path = OUT / f"vitrail-{name}.png"
    driver.save_screenshot(str(path))
    print(f"  -> {path}", flush=True)
    return path


def click_by_text(driver: webdriver.Firefox, text: str) -> bool:
    for element in driver.find_elements(By.CSS_SELECTOR, "button, li button, a"):
        try:
            if text.lower() in (element.text or "").lower():
                driver.execute_script("arguments[0].click();", element)
                return True
        except Exception:
            continue
    return False


def click_aria(driver: webdriver.Firefox, label: str) -> bool:
    for element in driver.find_elements(By.CSS_SELECTOR, f'button[aria-label="{label}"]'):
        driver.execute_script("arguments[0].click();", element)
        return True
    return False


def main() -> int:
    label = sys.argv[1] if len(sys.argv) > 1 else "tablette"
    width, height = VIEWPORTS[label]

    driver = build(width, height)
    try:
        driver.get(BASE)
        time.sleep(4)
        shoot(driver, f"{label}-1-bibliotheque")

        # Jouer un morceau qui a des paroles (Let It In)
        ok = click_by_text(driver, "Let It In")
        print("  morceau cliqué:", ok, flush=True)
        time.sleep(6)
        shoot(driver, f"{label}-2-lecteur")

        # Mode paroles (visible seulement en portrait)
        switched = click_aria(driver, "Paroles")
        print("  mode paroles:", switched, flush=True)
        time.sleep(5)
        shoot(driver, f"{label}-3-paroles")

        time.sleep(3)
        shoot(driver, f"{label}-4-paroles-chargees")

        # File d'attente
        opened = click_aria(driver, "File d'attente")
        print("  file ouverte:", opened, flush=True)
        time.sleep(3)
        shoot(driver, f"{label}-5-file")

        # Vérification que le son joue réellement
        audio_state = driver.execute_script(
            """
            const a = document.querySelector('audio') || (window.__vitrailAudio);
            if (!a) return { found: false };
            return {
              found: true,
              currentTime: a.currentTime,
              paused: a.paused,
              readyState: a.readyState,
              duration: a.duration,
              error: a.error ? a.error.code : null,
              src: a.currentSrc || a.src,
            };
            """
        )
        print("  audio:", audio_state, flush=True)
    finally:
        driver.quit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
