# DCTerra SD Chat

Een ChatGPT-achtige webapp die draait op de AI-server van de opleiding Software Development. Je kunt ermee chatten, code laten uitleggen, foto's laten beschrijven en afbeeldingen laten maken. Alles loopt via de OpenAI-API, dus wat je hier leert werkt ook met OpenAI, Azure en andere aanbieders.

In deze README lees je hoe je het project op je eigen computer werkend krijgt.

---

## Wat de app kan

- **Chatten** met antwoorden die woord voor woord verschijnen (streaming), met opmaak en code-highlighting.
- **Gesprekken bewaren** in een zijbalk (in je eigen browser).
- **Foto's laten lezen**: voeg een afbeelding toe met 📎.
- **Afbeeldingen maken**: vraag bijvoorbeeld *"Maak een afbeelding van een robot die leert programmeren"*. Het taalmodel roept dan zelf een functie aan die de afbeelding maakt (*tool calling*).

---

## Stap 1: Vraag je API-key aan

De AI-server is alleen te gebruiken met een **persoonlijke API-key**. Die krijg je van je docent.

- Vraag je docent om je key, bijvoorbeeld via Teams of mail. Vermeld je **naam, klas en studentnummer**.
- De key is een lange code die begint met `sk-`.
- **Je key is persoonlijk.** Deel hem niet, zet hem niet in je code en niet in Git. Al je gebruik wordt geregistreerd op jouw key.
- Is je key kwijt of per ongeluk gedeeld (bijvoorbeeld in een commit)? Meld het meteen bij je docent. Die zet de oude key uit en geeft je een nieuwe.

---

## Stap 2: Wat je nodig hebt

- **Python 3.10 of nieuwer.** Controleer met `python --version` (op macOS: `python3 --version`). Nog niet geïnstalleerd? Download het via [python.org](https://www.python.org/downloads/). Vink op Windows **"Add Python to PATH"** aan tijdens de installatie.
- **Git**, om het project te downloaden.
- **Toegang tot deze repository** op GitHub (je docent voegt je toe aan de organisatie).
- Een internetverbinding. Je hoeft géén VPN of Tailscale te installeren.

---

## Stap 3: Project downloaden

```bash
git clone git@github.com:DC-SD-Emmen/DCTerra-SD-chat.git
cd DCTerra-SD-chat
```

Gebruik je geen SSH-key bij GitHub? Dan kan het ook via HTTPS:

```bash
git clone https://github.com/DC-SD-Emmen/DCTerra-SD-chat.git
```

---

## Stap 4: Python-omgeving maken en pakketten installeren

Een *virtual environment* (venv) houdt de pakketten van dit project gescheiden van de rest van je computer.

**Windows (PowerShell of opdrachtprompt)**

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

**macOS / Linux**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Je ziet nu `(venv)` voor je opdrachtregel staan. Dat betekent dat de omgeving actief is. Open je later een nieuwe terminal, activeer hem dan opnieuw met de tweede regel.

> Krijg je op Windows een foutmelding over *execution policy* bij het activeren? Voer dan eenmalig uit: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## Stap 5: Je API-key instellen

De app leest je key uit een bestand `.env`. Dat bestand maak je zelf; het staat in `.gitignore` en komt dus nooit in Git.

1. Kopieer het voorbeeldbestand:

   ```bash
   # Windows
   copy .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```

2. Open `.env` in je editor en vervang de voorbeeldwaarde door **jouw eigen key**:

   ```
   AI_API_KEY=sk-jouw-eigen-key-van-je-docent
   ```

   Geen spaties rond het `=`-teken en geen aanhalingstekens.

3. Sla het bestand op.

> Controleer voordat je iets commit met `git status` dat `.env` er **niet** tussen staat.

---

## Stap 6: De app starten

```bash
python app.py
```

Open daarna in je browser: **http://localhost:5000**

Stoppen doe je met `Ctrl + C` in de terminal.

Probeer bijvoorbeeld:

- *"Leg uit wat een API is, met een voorbeeld in Python"*
- *"Maak een afbeelding van een uil met een bril die code leest"*
- Voeg met 📎 een screenshot van een foutmelding toe en vraag wat er mis is.

---

## Werkt het niet?

| Wat je ziet | Oorzaak | Oplossing |
| --- | --- | --- |
| `KeyError: 'AI_API_KEY'` bij het starten | Er is geen `.env`, of de key staat er niet in | Doe stap 5 opnieuw. Staat `.env` in dezelfde map als `app.py`? |
| `ModuleNotFoundError: No module named 'flask'` | De venv is niet actief of de pakketten zijn niet geïnstalleerd | Activeer de venv en voer `pip install -r requirements.txt` uit |
| Fout **401** in de chat | Je key klopt niet | Kopieer je key opnieuw, zonder spaties of aanhalingstekens |
| Fout **403** in de chat | Je key mag dat model niet gebruiken | Vraag je docent om je key te controleren |
| Fout **429** in de chat | Je limiet is bereikt (20 verzoeken per minuut) | Wacht een minuut en probeer opnieuw |
| Verbindingsfout of time-out | De AI-server is even niet bereikbaar, of er wordt een model geladen | Probeer het na een minuut opnieuw; blijft het, meld het bij je docent |
| `Address already in use` | Poort 5000 is al in gebruik (op macOS vaak door AirPlay) | Zet `PORT=5050` in `.env` en open http://localhost:5050 |

---

## Hoe het werkt

```
Browser  ──►  app.py (Flask, jouw computer)  ──►  AI-server van de opleiding
 (HTML/JS)        kent jouw API-key                  taalmodellen + beeldmodel
```

De browser praat alleen met je eigen backend (`app.py`). Alleen de backend kent je API-key. Zo kan niemand die de webpagina bekijkt je key stelen.

| Bestand | Wat het doet |
| --- | --- |
| `app.py` | Flask-backend. Stuurt het gesprek naar de AI-server, voert tool-aanroepen uit (afbeelding maken) en streamt het antwoord naar de browser. |
| `static/index.html` | De opbouw van de pagina. |
| `static/app.js` | Gesprekken bewaren, de stream lezen, Markdown tonen, foto's verkleinen en versturen. |
| `static/style.css` | De opmaak in DCTerra-stijl. |
| `.env.example` | Voorbeeld van de instellingen. Jouw echte instellingen staan in `.env`. |

### Modellen

| Model | Waarvoor |
| --- | --- |
| `gpt-oss:20b` | Snel, algemene vragen en uitleg (standaard) |
| `qwen3.6:35b` | Sterker in code en kan afbeeldingen lezen |
| `z-image-turbo` | Maakt afbeeldingen |

### Tool calling in het kort

1. De backend stuurt het gesprek naar het taalmodel, samen met een beschrijving van de functie `maak_afbeelding`.
2. Vraag jij om een afbeelding, dan antwoordt het model met een *tool call*: de naam van de functie en de argumenten (een beschrijving en het formaat).
3. De backend voert de functie uit met `client.images.generate(model="z-image-turbo", ...)`.
4. Het resultaat gaat terug naar het model, dat daarna een kort antwoord schrijft.

### Zelf de API gebruiken

Je key werkt ook in je eigen projecten. Bijvoorbeeld een afbeelding maken zonder chat:

```python
import base64, os
from openai import OpenAI

client = OpenAI(base_url="https://ai-pc.taile10d2b.ts.net/v1", api_key=os.environ["AI_API_KEY"])
r = client.images.generate(model="z-image-turbo", prompt="A lighthouse at sunset, watercolor",
                           size="1024x1024", response_format="b64_json")
open("vuurtoren.png", "wb").write(base64.b64decode(r.data[0].b64_json))
```

Meer voorbeelden (JavaScript, C#, embeddings) staan in de **Studentenhandleiding** die je van je docent krijgt.

---

## Zelf uitbreiden

- Pas `SYSTEEMPROMPT` in `app.py` aan: maak er een quizmaster, code-reviewer of sollicitatiecoach van.
- Voeg een tweede tool toe, bijvoorbeeld `bereken` of `zoek_in_documenten`, en laat het model kiezen welke het gebruikt.
- Sla gesprekken op in een database in plaats van in de browser, met inloggen per gebruiker.
- Voeg een knop toe om een gemaakte afbeelding aan te passen (*"maak de achtergrond blauw"*).

---

## Afspraken

- Je key is persoonlijk en blijft uit Git.
- Voer geen gevoelige persoonsgegevens in.
- Controleer wat de AI zegt: een taalmodel kan overtuigend fouten maken, ook in code.
- Vermeld AI-gebruik in je opdrachten volgens de regels van de opleiding.
