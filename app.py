"""
SD Chat — een ChatGPT-achtige webapp voor de AI-server van de opleiding.

Laat zien hoe je met de OpenAI-API:
  - antwoorden streamt (Server-Sent Events),
  - afbeeldingen laat lezen (vision),
  - het model zelf een afbeelding laat maken via tool calling.

De browser praat alleen met deze backend; alleen de backend kent de API-key.
Start met:  python app.py   en open  http://localhost:5000
"""
import base64
import json
import os
import uuid

from dotenv import load_dotenv
from flask import Flask, Response, request, send_from_directory
from openai import OpenAI

load_dotenv()  # leest AI_API_KEY (en eventueel AI_BASE_URL) uit .env

client = OpenAI(
    base_url=os.getenv("AI_BASE_URL", "https://ai-pc.taile10d2b.ts.net/v1"),
    api_key=os.environ["AI_API_KEY"],
)

MODELLEN = ["gpt-oss:20b", "qwen3.6:35b"]
VISION_MODEL = "qwen3.6:35b"          # gpt-oss kan geen afbeeldingen lezen
BEELD_MODEL = "z-image-turbo"
MAP_AFBEELDINGEN = os.path.join(os.path.dirname(__file__), "static", "afbeeldingen")
os.makedirs(MAP_AFBEELDINGEN, exist_ok=True)

SYSTEEMPROMPT = (
    "Je bent SD Chat, een behulpzame assistent voor studenten Software Development. "
    "Antwoord in het Nederlands, duidelijk en niet langer dan nodig. Gebruik Markdown en codeblokken. "
    "Als de gebruiker om een afbeelding, tekening, logo of illustratie vraagt, gebruik dan de tool "
    "maak_afbeelding. Zeg daarna kort wat je gemaakt hebt; beschrijf de afbeelding niet opnieuw in detail."
)

# De tool die het model mag aanroepen. Het model vult zelf de argumenten in.
TOOLS = [{
    "type": "function",
    "function": {
        "name": "maak_afbeelding",
        "description": "Maakt een afbeelding op basis van een beschrijving en toont die aan de gebruiker.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Gedetailleerde beschrijving van de afbeelding, in het Engels "
                                   "(onderwerp, stijl, kleuren, compositie, belichting).",
                },
                "formaat": {"type": "string", "enum": ["vierkant", "liggend", "staand"]},
            },
            "required": ["prompt"],
        },
    },
}]
FORMATEN = {"vierkant": "1024x1024", "liggend": "1344x768", "staand": "768x1344"}

app = Flask(__name__, static_folder="static")


def maak_afbeelding(prompt, formaat="vierkant"):
    """Vraagt de AI-server om een afbeelding en slaat die op. Geeft de URL terug."""
    resultaat = client.images.generate(
        model=BEELD_MODEL, prompt=prompt, size=FORMATEN.get(formaat, "1024x1024"),
        response_format="b64_json",
    )
    naam = f"{uuid.uuid4().hex}.png"
    with open(os.path.join(MAP_AFBEELDINGEN, naam), "wb") as f:
        f.write(base64.b64decode(resultaat.data[0].b64_json))
    return f"/static/afbeeldingen/{naam}"


def bevat_afbeelding(bericht):
    inhoud = bericht.get("content")
    return isinstance(inhoud, list) and any(d.get("type") == "image_url" for d in inhoud)


def event(**data):
    return f"data: {json.dumps(data)}\n\n"


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


@app.post("/api/chat")
def chat():
    data = request.get_json()
    model = data.get("model") if data.get("model") in MODELLEN else MODELLEN[0]
    berichten = data["berichten"][-20:]

    # Zit er een afbeelding in het laatste bericht? Dan hebben we een vision-model nodig.
    wissel = bevat_afbeelding(berichten[-1]) and model != VISION_MODEL
    if wissel:
        model = VISION_MODEL
    berichten = [{"role": "system", "content": SYSTEEMPROMPT}] + berichten
    extra = {"reasoning_effort": "none"} if model.startswith("qwen") else {}

    def stream():
        if wissel:
            yield event(type="status", tekst=f"Afbeelding gezien: {model} leest mee")
        try:
            # Maximaal 3 rondes: antwoord -> (tool) -> antwoord
            for _ in range(3):
                antwoord = client.chat.completions.create(
                    model=model, messages=berichten, tools=TOOLS, stream=True, **extra
                )
                tekst, aanroepen = "", {}
                for stukje in antwoord:
                    if not stukje.choices:
                        continue
                    delta = stukje.choices[0].delta
                    if delta.content:
                        tekst += delta.content
                        yield event(type="tekst", tekst=delta.content)
                    # Tool-aanroepen komen in stukjes binnen; plak ze per index aan elkaar
                    for tc in delta.tool_calls or []:
                        a = aanroepen.setdefault(tc.index, {"id": "", "naam": "", "args": ""})
                        a["id"] = tc.id or a["id"]
                        if tc.function and tc.function.name:
                            a["naam"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            a["args"] += tc.function.arguments

                if not aanroepen:
                    break  # gewoon antwoord, klaar

                # Het model wil een tool gebruiken: voer die uit en geef het resultaat terug
                berichten.append({"role": "assistant", "content": tekst or None, "tool_calls": [
                    {"id": a["id"], "type": "function", "function": {"name": a["naam"], "arguments": a["args"]}}
                    for a in aanroepen.values()
                ]})
                for a in aanroepen.values():
                    args = json.loads(a["args"] or "{}")
                    yield event(type="status", tekst="Afbeelding maken…")
                    try:
                        url = maak_afbeelding(args.get("prompt", ""), args.get("formaat", "vierkant"))
                        yield event(type="afbeelding", url=url, prompt=args.get("prompt", ""))
                        resultaat = "De afbeelding is gemaakt en aan de gebruiker getoond."
                    except Exception as fout:
                        resultaat = f"Het maken van de afbeelding is mislukt: {fout}"
                        yield event(type="fout", tekst=resultaat)
                    berichten.append({"role": "tool", "tool_call_id": a["id"], "content": resultaat})
        except Exception as fout:
            yield event(type="fout", tekst=str(fout))
        yield "data: [KLAAR]\n\n"

    return Response(stream(), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5000)), threaded=True)
