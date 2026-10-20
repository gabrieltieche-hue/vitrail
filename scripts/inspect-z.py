#!/usr/bin/env python3.13
"""Inspecte les styles calculés de la feuille de file d'attente."""
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

options = Options()
options.add_argument("-headless")
options.binary_location = "/tmp/opencode/firefox/firefox"
service = Service(executable_path="/tmp/opencode/geckodriver")
driver = webdriver.Firefox(options=options, service=service)
driver.set_window_size(1280, 800)

try:
    driver.get("http://127.0.0.1:4199/")
    time.sleep(4)
    for element in driver.find_elements(By.CSS_SELECTOR, "button"):
        if "Let It In" in (element.text or ""):
            driver.execute_script("arguments[0].click();", element)
            break
    time.sleep(5)
    for element in driver.find_elements(By.CSS_SELECTOR, "button[aria-label=\"File d'attente\"]"):
        driver.execute_script("arguments[0].click();", element)
        break
    time.sleep(2)

    result = driver.execute_script(
        """
        const out = [];
        document.querySelectorAll('*').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' && parseInt(cs.zIndex || '0') > 5) {
            out.push({
              tag: el.tagName,
              cls: (el.className || '').toString().slice(0, 90),
              z: cs.zIndex,
              opacity: cs.opacity,
              bg: cs.backgroundColor,
              filter: cs.backdropFilter,
              transform: cs.transform,
            });
          }
        });
        return out;
        """
    )
    for item in result:
        print(item, flush=True)
finally:
    driver.quit()
