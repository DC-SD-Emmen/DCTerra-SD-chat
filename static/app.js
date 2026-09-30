// SD Chat — de voorkant. Gesprekken worden bewaard in de browser (localStorage).

const $ = (id) => document.getElementById(id);
const chat = $("chat"), invoer = $("invoer"), knop = $("verstuur");

let gesprekken = laad();          // [{ id, titel, berichten: [...] }]
let actief = null;                // id van het open gesprek
let bijlagen = [];                // data-URL's van afbeeldingen die klaarstaan
let bezig = null;                 // AbortController van het lopende verzoek

// ---------- opslag ----------
function laad() {
  try { return JSON.parse(localStorage.getItem("sdchat") || "[]"); } catch { return []; }
}
function bewaar() {
  try { localStorage.setItem("sdchat", JSON.stringify(gesprekken)); }
  catch {
    // Opslag vol (afbeeldingen zijn groot): verwijder foto's uit oude gesprekken en probeer opnieuw
    for (const g of gesprekken.slice(1)) for (const b of g.berichten) delete b.fotos;
    try { localStorage.setItem("sdchat", JSON.stringify(gesprekken)); } catch {}
  }
}
const huidig = () => gesprekken.find((g) => g.id === actief);

// ---------- zijbalk ----------
function toonLijst() {
  const nav = $("gesprekken");
  nav.innerHTML = "";
  for (const g of gesprekken) {
    const rij = document.createElement("div");
    rij.className = "gesprek" + (g.id === actief ? " actief" : "");
    const titel = document.createElement("button");
    titel.className = "titel"; titel.textContent = g.titel;
    titel.onclick = () => { open(g.id); $("zijbalk").classList.remove("open"); };
    const weg = document.createElement("button");
    weg.className = "weg"; weg.textContent = "✕"; weg.title = "Verwijderen";
    weg.onclick = () => { gesprekken = gesprekken.filter((x) => x.id !== g.id); bewaar(); if (actief === g.id) nieuw(); else toonLijst(); };
    rij.append(titel, weg);
    nav.appendChild(rij);
  }
}

function nieuw() {
  actief = null;
  chat.innerHTML = "";
  chat.appendChild(welkom);
  toonLijst();
  invoer.focus();
}

function open(id) {
  actief = id;
  chat.innerHTML = "";
  for (const b of huidig().berichten) toonBericht(b);
  toonLijst();
  chat.scrollTop = chat.scrollHeight;
}

// ---------- berichten tonen ----------
function toonBericht(b) {
  const div = document.createElement("div");
  div.className = "bericht " + (b.role === "user" ? "gebruiker" : "assistent");
  if (b.role === "user") {
    if (b.fotos?.length) {
      const f = document.createElement("div"); f.className = "fotos";
      for (const src of b.fotos) { const img = new Image(); img.src = src; f.appendChild(img); }
      div.appendChild(f);
    }
    const ballon = document.createElement("div"); ballon.className = "ballon"; ballon.textContent = b.content;
    div.appendChild(ballon);
  } else {
    const inhoud = document.createElement("div"); inhoud.className = "inhoud";
    div.appendChild(inhoud);
    vulAssistent(inhoud, b);
  }
  chat.appendChild(div);
  return div;
}

function vulAssistent(el, b) {
  el.innerHTML = "";
  for (const a of b.afbeeldingen || []) {
    const fig = document.createElement("div"); fig.className = "gemaakt";
    fig.innerHTML = `<img src="${a.url}" alt=""><a href="${a.url}" download>Downloaden</a>`;
    fig.querySelector("img").alt = a.prompt;
    el.appendChild(fig);
  }
  const tekst = document.createElement("div");
  tekst.innerHTML = DOMPurify.sanitize(marked.parse(b.content || ""));
  tekst.querySelectorAll("pre code").forEach((code) => {
    hljs.highlightElement(code);
    const k = document.createElement("button"); k.className = "kopieer"; k.textContent = "Kopieer"; k.type = "button";
    k.onclick = () => { navigator.clipboard.writeText(code.innerText); k.textContent = "Gekopieerd"; setTimeout(() => (k.textContent = "Kopieer"), 1500); };
    code.parentElement.appendChild(k);
  });
  el.appendChild(tekst);
  if (b.status) { const s = document.createElement("div"); s.className = "status"; s.textContent = b.status; el.appendChild(s); }
  if (b.fout) { const f = document.createElement("div"); f.className = "fout"; f.textContent = "Fout: " + b.fout; el.appendChild(f); }
}

// ---------- berichten versturen ----------
// Zet onze opgeslagen berichten om naar het formaat van de OpenAI-API
function naarApi(berichten) {
  return berichten.map((b, i) => {
    if (b.role === "user") {
      const laatste = i === berichten.length - 1;
      if (b.fotos?.length && laatste) {
        return { role: "user", content: [{ type: "text", text: b.content || "Wat zie je?" },
          ...b.fotos.map((url) => ({ type: "image_url", image_url: { url } }))] };
      }
      return { role: "user", content: b.content + (b.fotos?.length ? " [afbeelding bijgevoegd]" : "") };
    }
    const extra = (b.afbeeldingen || []).map((a) => `[Afbeelding gemaakt: ${a.prompt}]`).join("\n");
    return { role: "assistant", content: [extra, b.content].filter(Boolean).join("\n") };
  });
}

async function verstuur(tekst) {
  if (bezig) return;
  if (!actief) {
    const g = { id: crypto.randomUUID(), titel: tekst.slice(0, 40) || "Afbeelding", berichten: [] };
    gesprekken.unshift(g); actief = g.id; chat.innerHTML = "";
  }
  const g = huidig();
  const vraag = { role: "user", content: tekst, fotos: bijlagen };
  g.berichten.push(vraag); toonBericht(vraag);
  bijlagen = []; toonBijlagen();

  const antwoord = { role: "assistant", content: "", afbeeldingen: [], status: "Denkt na…" };
  g.berichten.push(antwoord);
  const el = toonBericht(antwoord).querySelector(".inhoud");
  toonLijst(); chat.scrollTop = chat.scrollHeight;

  bezig = new AbortController();
  knop.textContent = "■"; knop.classList.add("stop"); knop.title = "Stoppen";

  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: bezig.signal,
      body: JSON.stringify({ berichten: naarApi(g.berichten.slice(0, -1)), model: $("model").value }),
    });
    // Lees de stream: elk "data: {...}"-blok is één gebeurtenis
    const lezer = res.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await lezer.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blokken = buffer.split("\n\n"); buffer = blokken.pop();
      for (const blok of blokken) {
        const data = blok.replace(/^data: /, "");
        if (data === "[KLAAR]") continue;
        const e = JSON.parse(data);
        if (e.type === "tekst") { antwoord.content += e.tekst; antwoord.status = null; }
        if (e.type === "status") antwoord.status = e.tekst;
        if (e.type === "afbeelding") { antwoord.afbeeldingen.push({ url: e.url, prompt: e.prompt }); antwoord.status = null; }
        if (e.type === "fout") { antwoord.fout = e.tekst; antwoord.status = null; }
        vulAssistent(el, antwoord);
        chat.scrollTop = chat.scrollHeight;
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") antwoord.fout = err.message;
  }
  antwoord.status = null; vulAssistent(el, antwoord);
  bezig = null; knop.textContent = "↑"; knop.classList.remove("stop"); knop.title = "Versturen";
  bewaar(); invoer.focus();
}

// ---------- afbeeldingen toevoegen ----------
// Verklein foto's in de browser, zodat ze snel verstuurd worden en in de opslag passen
function verklein(bestand, max = 1024) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s; c.height = img.height * s;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = URL.createObjectURL(bestand);
  });
}
function toonBijlagen() {
  const box = $("bijlagen"); box.innerHTML = "";
  bijlagen.forEach((src, i) => {
    const d = document.createElement("div"); d.className = "bijlage";
    d.innerHTML = `<img src="${src}"><button type="button">✕</button>`;
    d.querySelector("button").onclick = () => { bijlagen.splice(i, 1); toonBijlagen(); };
    box.appendChild(d);
  });
}
$("bestand").onchange = async (e) => {
  for (const f of e.target.files) bijlagen.push(await verklein(f));
  e.target.value = ""; toonBijlagen();
};

// ---------- invoer ----------
$("formulier").onsubmit = (e) => {
  e.preventDefault();
  if (bezig) { bezig.abort(); return; }
  const tekst = invoer.value.trim();
  if (!tekst && !bijlagen.length) return;
  invoer.value = ""; invoer.style.height = "auto";
  verstuur(tekst);
};
invoer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("formulier").requestSubmit(); }
});
invoer.addEventListener("input", () => { invoer.style.height = "auto"; invoer.style.height = invoer.scrollHeight + "px"; });

$("nieuw").onclick = nieuw;
$("menu").onclick = () => $("zijbalk").classList.toggle("open");
const welkom = $("welkom");
welkom.querySelectorAll(".suggesties button").forEach((b) => (b.onclick = () => verstuur(b.textContent)));

nieuw();
