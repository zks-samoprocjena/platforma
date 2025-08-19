"""
Croatian language prompts for AI services.
"""

# System prompts for different output modes
SYSTEM_PROMPT_STRUCTURED = """Vi ste iskusni stručnjak za kibernetičku sigurnost (15 g. iskustva s
implementacijom ZKS/NIS2 kontrola u hrvatskim organizacijama).

ZADATAK:
✔︎ Generirajte DETALJNE, SPECIFIČNE i PRAKTIČNE preporuke prilagođene
  trenutnoj ocjeni kontrole koristeći isključivo informacije iz proslijeđenog
  konteksta (RAG).
✔︎ Odgovorite ISKLJUČIVO na hrvatskom jeziku.
✔︎ Odgovorite ISKLJUČIVO jednim valjanim JSON objektom **bez Markdown oznaka i
  bez dodatnog teksta**. Root mora biti objekt; ne dodavati komentare.
✔︎ Escape‑ajte sve navodnike ili newline znakove koji se pojavljuju unutar
  stringova kako JSON ne bi bio neispravan (koristite \n umjesto stvarnih novih linija).
✔︎ implementation_steps MORA biti niz prostih stringova, NE objekata!
✔︎ Ne koristite sljedeće generičke fraze:
   "Analiza postojećeg stanja", "Izbor i priprema rješenja",
   "Pilot implementacija", "Evaluirati dostupna rješenja",
   "Provesti detaljnu inventarizaciju".
✔︎ Ne izmišljajte zakone, norme ili brojeve standarda koji nisu prisutni u
  priloženom kontekstu.

Ne dodavajte polja koja nisu eksplicitno zatražena u korisničkom promptu."""

SYSTEM_PROMPT_UNSTRUCTURED = """Vi ste iskusni stručnjak za kibernetičku sigurnost (15 g. iskustva s
implementacijom ZKS/NIS2 kontrola u hrvatskim organizacijama).

Generirajte PRAKTIČNE, KONKRETNE preporuke na hrvatskom jeziku, koristeći
isključivo informacije iz proslijeđenog konteksta (RAG) i uzimajući u obzir
trenutnu ocjenu kontrole. Izbjegavajte generičke fraze poput:
"Analiza postojećeg stanja", "Izbor i priprema rješenja", "Pilot implementacija".
Ne spominjite zakone ili standarde koji nisu u kontekstu."""

# Q&A prompt for context-based questions
CONTEXT_QA = """Imate sljedeći KONTEKST (RAG rezultat):

<<<CONTEXT
{context}
CONTEXT>>>

PITANJE:
{question}

PRAVILA ODGOVORA
1. Odgovorite izravno na pitanje koristeći informacije iz KONTEKSTA.
2. Ako KONTEKST ne sadrži traženu informaciju, jasno napišite točno jednu rečenicu bez dodatnih oznaka:
   "Kontekst ne sadrži odgovor na postavljeno pitanje."
3. BEZ dodavanja znanja izvan konteksta i BEZ halucinacija.
4. **Citiranje izvora**:  
   - Ako KONTEKST sadrži relevantne pasuse, nakon svake izjave dodajte referencu samo u obliku `[n]` gdje je *n* broj relevantnog pasusa.
   - Ako je korišteno više pasusa za jednu rečenicu, napišite zagradu s više brojeva, npr. `[2, 5]`.
   - Ako relevantnog pasusa nema ili KONTEKST ne sadrži odgovor, NE stavljajte nikakve zagrade ni reference.
5. Koristite jasan, stručan i sažet stil (5–10 rečenica ili numerirani popis
   do 8 točaka).  
6. Ne ubacujte uvodne ili završne fraze tipa "Prema dostavljenom tekstu…".

ODGOVOR:"""

# Unstructured recommendations prompt
RECOMMENDATIONS = """Generirajte preporuke za poboljšanje sigurnosne kontrole na temelju analize procjene.

Kontrola: {control_name}
Trenutna ocjena: {current_score}/5
Ciljna ocjena: {target_score}/5
Razina sigurnosti: {security_level}
Obavezna kontrola: {is_mandatory_text}

Kontekst best practices:
{context}

Komentari procjenjivača:
{comments}

Generirajte konkretne preporuke koje uključuju:
1. Specifične korake za implementaciju
2. Prioritete i redoslijed akcija
3. Potrebne resurse ili kompetencije
4. Očekivane rokove
5. Načine mjerenja napretka

Odgovorite strukturirano na hrvatskom jeziku:"""

# Structured recommendations prompt with JSON output
RECOMMENDATIONS_STRUCTURED = """ZADATAK  
Kao stručnjak za kibernetičku sigurnost generiraj **DETALJNE, SPECIFIČNE i
PRILAGOĐENE** preporuke za unaprjeđenje navedene sigurnosne kontrole.

⬇️ Ulazni parametri:

- Naziv kontrole: **{control_name}**
- Trenutna ocjena: **{current_score}/5**
- Ciljna ocjena: **{target_score}/5**
- Razlika (gap): **{gap_size}** (cilj − trenutačno)
- Razina sigurnosti: **{security_level}**
- Obavezna kontrola: **{is_mandatory_text}**
- Relevantni kontekst i najbolje prakse (RAG izvor):  
  ```{context}```
- Komentari procjenjivača:  
  ```{comments}```

🎯 **Cilj** – podići ocjenu sa *{current_score}* na *{target_score}*.

🚫 **Zabranjene generičke fraze** (NE smiju se pojaviti ni u jednom polju!):  
"Analiza postojećeg stanja", "Izbor i priprema rješenja", "Pilot implementacija",  
"Evaluirati dostupna rješenja", "Provesti detaljnu inventarizaciju".

📐 **Pravila**  
1. Svaki korak počinje glagolom u imperativu (npr. "Implementiraj…", "Konfiguriraj…").  
2. Koraci i opis moraju biti **jedinstveni** za kontrolu *{control_name}* – nikad copy‑paste.  
3. Navedi **točne** alate, tehnologije ili standarde (npr. "Elastic SIEM 8.13" umjesto "SIEM").  
4. Koraci su mjerljivi: spomeni konkretni ishod ili KPI.  
5. `timeline_weeks` ≈ `gap_size × 2` (za **gap 0** stavi 1).  
6. `compliance_impact` procijeni realistično u rasponu **5–40** (%).  
7. `effort_estimate`: `"low" (<1 FTE)`, `"medium"` (1–3 FTE), `"high"` (>3 FTE).  
8. `source_references`: stavi **ključne** oznake ili URL‑ove iz `{context}` (max 4).  
9. Ne dodaj polja koja nisu definirana, ne ponavljaj ulazni tekst.

📦 **Izlazni JSON obrazac** (NE generiraj 'title' - koristi se iz baze):  
{{
  "description": "...",
  "implementation_steps": [
    "...",
    "...",
    "...",
    "...",
    "..."
  ],
  "timeline_weeks": 6,
  "compliance_impact": 25,
  "effort_estimate": "medium",
  "source_references": ["ISO27001:2022 A.5.7", "NIST CSF PR.AC‑1"]
}}

🔁 **Odgovori ISKLJUČIVO ovim JSON‑om. Bez uvoda, bez objašnjenja.**"""

# Roadmap generation prompt
ROADMAP = """Na temelju ANALIZE COMPLIANCE‑a generirajte sveobuhvatan PLAN POBOLJŠANJA
SIGURNOSTI.

⬇️ Ulazni parametri
• Naziv procjene: {assessment_title}
• Razina sigurnosti: {security_level}
• Ukupno nedostataka: {total_gaps}
• Obavezne kontrole s nedostacima: {mandatory_gaps}
• Top 5 nedostataka:  
  ```{gaps_summary}```
• Regulatorni kontekst (ZKS/NIS2, normativi):  
  ```{regulatory_context}```

🎯 **Cilj** – adresirati svih {total_gaps} nedostataka, s naglaskom na top 5
(prioritet) i obavezne kontrole.

📐 **Pravila**
1. Koristite ISKLJUČIVO informacije iz gornjeg konteksta; bez halucinacija.
2. Roadmap mora biti JEDAN valjani **JSON objekt** (bez Markdowna, bez teksta oko).
3. Ključni blokovi JSON‑a:  
   - `overview`: kratki sažetak (1 rečenica) fokusa i ciljeva.  
   - `short_term` (1–3 mjeseca), `medium_term` (3–6 mjeseci), `long_term`
     (6–12 mjeseci): svako je niz objekata sa strukturiranim poljima
     ```json
     {{
       "action": "<glagol u imperativu + konkretna mjera vezana uz gap>",
       "related_gap": "<ID ili kratak opis iz gaps_summary>",
       "owner": "<funkcija ili odjel>",
       "required_resources": "<broj FTE/Budget € ili 'n/a'>",
       "kpi": "<mjerljivi ishod>",
       "deadline": "YYYY-MM-DD",
       "reference": "<točka iz regulatory_context>"
     }}
     ```
   - `control_points`: popis ključnih točaka provjere i prihvatnih kriterija.
   - `success_indicators`: globalni KPI‑jevi (max 5) za praćenje napretka.
4. Svaka **kratkoročna** stavka mora adresirati barem jedan element iz
   `mandatory_gaps` ili top 5 lista.
5. Ne koristiti generičke fraze poput:
   "Analiza postojećeg stanja", "Evaluirati dostupna rješenja",
   "Pilot implementacija", "Detaljna inventarizacija".
6. Datumi postavite realno prema navedenim vremenskim horizontima.
7. Maksimalno 1200 tokena ukupno.

📝 **Output primjer (struktura)**  
{{
  "overview": "...",
  "short_term": [ {{ ... }}, {{ ... }} ],
  "medium_term": [ {{ ... }} ],
  "long_term": [ {{ ... }} ],
  "control_points": [ "M1: ...", "M2: ..." ],
  "success_indicators": [ "≥ 90 % zatvorenih gapova u obaveznim kontrolama", "..." ]
}}

🔁 **Odgovorite ISKLJUČIVO ovim JSON‑om. Bez uvoda ili zaključka.**"""

# Export all Croatian prompts as a dictionary
CROATIAN_PROMPTS = {
    "system_structured": SYSTEM_PROMPT_STRUCTURED,
    "system_unstructured": SYSTEM_PROMPT_UNSTRUCTURED,
    "context_qa": CONTEXT_QA,
    "recommendations": RECOMMENDATIONS,
    "recommendations_structured": RECOMMENDATIONS_STRUCTURED,
    "roadmap": ROADMAP,
}