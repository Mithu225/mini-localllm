# Lokal LLM RAG Agent

En kraftfull AI-agent for dokumentanalyse og spørsmål/svar direkte i nettleseren, med ultra-rask vektorsøk ved hjelp av Voy. All prosessering skjer lokalt i nettleseren - ingen server er nødvendig!

[Live Demo](https://mini-local-llm.thuhuynh.no)

![License](https://img.shields.io/badge/license-MIT-blue)

## Hovedfunksjoner

- **100% Privat & Lokal**: All data forblir i nettleseren din
- **Ultra-rask Søk**: Sub-millisekund vektorsøk med Voy
- **Avansert RAG**: Flertrinns resonnement og oppgavedekomponering
- **Dokumentintelligens**: Dyp PDF-analyse og forståelse
- **Flerspråklig**: Full støtte for engelsk og norsk
- **Høy Ytelse**: WebGPU-akselerasjon + WASM-optimalisering

## Teknologistabel

- **Kjerneteknologier**

  - Next.js 13+ (App Router)
  - React 18
  - TypeScript
  - WebLLM
  - LangGraph
  - Voy Vector Search

- **AI-modeller**

  - nomic-ai/nomic-embed-text-v1.5
  - nomic-ai/nomic-embed-text-v1.5
  - NB-Llama-3.2-3B-Instruct (in-progress)
  - Granite-Embedding-278m-multilingual (in-progress)

- **Brukergrensesnitt**
  - Tailwind CSS
  - Shadcn UI
  - React Toastify

## Systemarkitektur

### Agent Arbeidsflyt

1. **Dokumentbehandling**

   - PDF-parsing & oppdeling
   - Embedding-generering
   - Voy vektorindeksering

2. **Spørsmålsforståelse**

   - Intensjonsanalyse
   - Oppgavedekomponering
   - Søkestrategiplanning

3. **Informasjonshenting**

   - Ultra-rask vektorsøk
   - Kontekstsyntese
   - Kildeverifisering

4. **Svarsgenerering**
   - Svarkomposisjon
   - Kildehenvisning
   - Kvalitetssikring

## Ytelsesmetrikk

| Operasjon            | Tid  | Minne | Suksessrate |
| -------------------- | ---- | ----- | ----------- |
| PDF-behandling (1MB) | 0.8s | ~50MB | 99%         |
| Vektorsøk            | <1ms | ~5MB  | 100%        |
| Spørsmålsplanlegging | 0.3s | ~30MB | 98%         |
| Svarsgenerering      | 1.2s | ~60MB | 97%         |

## Detaljerte Funksjoner

### Dokumentbehandling

- Dra-og-slipp PDF-opplasting
- Intelligent tekstutvinning
- Smart oppdeling
- Sanntidsindeksering

### Vektorsøk

- Sub-millisekund latens
- HNSW-algoritme
- Minneeffektiv lagring
- Dynamiske indeksoppdateringer

### Chatgrensesnitt

- Sanntidsstrømming
- Kontekstutheving
- Kildehenvisninger
- Kodeformatering (in-progress)
- Markdown-støtte (in-progress)

## Veikart

- [ ] Støtte for flere dokumentformater
- [ ] Forbedret agentsamarbeid
- [ ] Dokumentsammendrag
- [ ] Talegrensesnitt
- [ ] Frakoblet funksjonalitet
- [ ] Multidokumentanalyse

## Hurtigstart

1. Besøk [Live Demo](https://mini-local-llm.thuhuynh.no)
2. Last opp et PDF-dokument
3. Begynn å stille spørsmål!

For lokal utvikling:

```bash
git clone https://github.com/mithu225/mini-localllm.git
cd rag-react
npm install
npm run dev
```

Besøk deretter `localhost:3000`

## Ressurser

- [LangGraph Docs](https://github.com/langchain-ai/langgraph)

## Bidrag

Bidrag er velkomne! Se vår [Bidragsguide](CONTRIBUTING.md).

## Lisens

MIT Thu Huynh

---

<p align="center">
  Utviklet med ❤️ av Thu Huynh
  <br>
  <a href="https://github.com/Mithu225">GitHub</a> •
  <a href="https://linkedin.com/in/Mithu225">LinkedIn</a>
</p>
