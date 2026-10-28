# PlanciaIT

> La plancia di comando dell'IT manager.

PlanciaIT è una web app che centralizza documentazione, password, inventario e monitoraggio dell'infrastruttura IT di una singola azienda. Utenti: l'IT manager (amministratore, vede tutto) e il suo team IT (vede solo le aree assegnate). Interfaccia in italiano. Prodotto open-core, installabile on-premise o in cloud tramite Docker.

Questo file è la fonte di verità per lo sviluppo. Leggilo all'inizio di ogni sessione e rispettalo. Se una richiesta è in conflitto con queste regole, fermati e chiedi.

---

## Stack

| Livello | Tecnologia |
| --- | --- |
| Linguaggio | TypeScript (strict) ovunque, tranne l'agent |
| Frontend | React + Vite, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Router, react-i18next |
| Backend | NestJS su Node.js LTS |
| Database | PostgreSQL 16+ con Drizzle ORM e migrazioni versionate |
| Code di lavoro | pg-boss (su PostgreSQL, niente Redis) |
| Crittografia | libsodium (`libsodium-wrappers-sumo`) |
| Editor procedure | Tiptap |
| Agent | Go, un unico eseguibile per Windows e Linux |
| Email | Nodemailer via SMTP configurato dal cliente |
| Distribuzione | Docker Compose + Caddy (HTTPS automatico) |
| Monorepo | pnpm workspaces + Turborepo |
| Test | Vitest (unitari e integrazione), Playwright (end-to-end) |

Non introdurre nuove dipendenze o servizi (Redis, Elasticsearch, altri database) senza chiedere prima.

## Struttura del repository

```
planciait/
├── CLAUDE.md
├── apps/
│   ├── web/          # frontend React (SPA)
│   ├── api/          # backend NestJS (API REST + worker pg-boss)
│   └── agent/        # agent Go per Windows e Linux
├── packages/
│   ├── crypto/       # tutta la crittografia (usata da web, e dai test)
│   ├── shared/       # tipi, schemi di validazione (zod), costanti condivise
│   └── db/           # schema Drizzle, migrazioni, seed
├── deploy/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── .env.example
└── docs/             # specifiche, decisioni architetturali (ADR)
```

Il worker gira come processo separato ma vive nel codice di `apps/api` (stesso modulo, entrypoint diverso).

## Comandi

Da tenere aggiornati man mano che vengono creati:

```
pnpm install          # installa le dipendenze
pnpm dev              # avvia web + api in sviluppo
pnpm test             # tutti i test
pnpm lint             # lint + controllo tipi
pnpm db:migrate       # applica le migrazioni
pnpm db:seed          # dati di prova
docker compose -f deploy/docker-compose.yml up -d   # ambiente completo
```

## Regole di sicurezza (non negoziabili)

### Vault zero-knowledge

- Il server **non deve mai** ricevere, salvare o loggare una password in chiaro, né la master password, né una chiave non cifrata.
- Tutta la cifratura e decifratura del vault avviene nel browser, tramite `packages/crypto`. Nessun'altra parte del codice implementa crittografia.
- Primitive ammesse, solo da libsodium:
  - derivazione chiave dalla master password: **Argon2id** (`crypto_pwhash`), salt casuale per utente;
  - cifratura simmetrica: **XChaCha20-Poly1305** (`crypto_aead_xchacha20poly1305_ietf`), nonce casuale per ogni cifratura;
  - coppie di chiavi e condivisione: **X25519** (`crypto_box_seal` per cifrare la chiave d'area per un membro).
- Mai inventare schemi crittografici, mai usare `Math.random`, mai riutilizzare un nonce.
- Separazione tra login e cifratura: dalla master password si derivano due chiavi distinte, una per l'autenticazione (il server ne salva solo un hash) e una per decifrare la chiave privata dell'utente.
- Modello: ogni utente ha una coppia X25519; la privata è salvata cifrata. Ogni area ha una chiave simmetrica, salvata cifrata con la pubblica di ogni membro. Revoca = eliminare la copia del membro e ruotare la chiave dell'area.
- Kit di emergenza: chiave di recupero generata alla registrazione, mostrata una sola volta.
- Ogni modifica a `packages/crypto` richiede test dedicati (round-trip, nonce diversi, decifratura fallita con chiave errata) e va segnalata esplicitamente nel riepilogo.

### Autenticazione e permessi

- Username + password + **MFA TOTP obbligatoria**, con codici di backup.
- Rate limiting e blocco temporaneo dopo tentativi falliti. Sessioni con scadenza, cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- Ruoli: `admin` (IT manager) e `technician`. I tecnici accedono solo alle aree assegnate, con permesso `read` o `write`.
- Ogni endpoint passa da una guardia di permessi. Nessun endpoint senza controllo esplicito. Il controllo dei permessi si fa sempre lato server, mai solo nell'interfaccia.

### Audit e dati

- Ogni azione rilevante (accesso, visualizzazione o copia di una credenziale, creazione, modifica, eliminazione, cambio permessi) scrive una riga nell'audit log. L'audit log non si modifica e non si cancella dall'applicazione.
- Mai loggare segreti, token, contenuto del vault o corpi di richiesta completi.
- Validare ogni input con zod (schemi in `packages/shared`). Query solo tramite Drizzle o SQL parametrizzato.

## Modello dati (sintesi)

Utente, Area, Asset (tipi + campi personalizzati), Credenziale (cifrata), Procedura e Versione procedura, Agent, Controllo, Misura, Allarme, Fornitore, Licenza, **Relazione** (collegamento generico tra due elementi qualsiasi), Audit log. Ogni elemento appartiene a un'area e ne eredita i permessi. Dettaglio completo nel documento di progetto.

## Convenzioni

- Codice, nomi di variabili, tabelle e commit in **inglese**. Testi dell'interfaccia in **italiano**, sempre tramite file di traduzione i18n (mai stringhe scritte direttamente nei componenti).
- TypeScript `strict`, niente `any` senza commento che lo giustifichi.
- Ogni modulo backend NestJS = cartella con controller, service, schemi, test.
- Commit piccoli in stile Conventional Commits (`feat:`, `fix:`, `chore:`…), uno per ogni passo funzionante.
- Le decisioni architetturali importanti vanno in `docs/adr/` (un file breve per decisione).
- Prima di dichiarare finito un lavoro: `pnpm lint` e `pnpm test` devono passare.

## Open-core

- Codice Community con licenza **AGPLv3**.
- Le funzioni Pro vivono in moduli separati e si attivano con una chiave di licenza firmata, verificabile offline. Non mescolare codice Pro dentro i moduli Community.
- Limiti Community iniziali: 3 utenti, 10 server monitorati, audit log di 30 giorni.

## Roadmap

- **Fase 0 – Fondamenta:** monorepo, autenticazione, MFA, utenti, aree e permessi, audit log, inventario base con import CSV, relazioni, ricerca globale.
- **Fase 1 – MVP:** vault zero-knowledge, procedure e knowledge base, agent e monitoraggio essenziale (ping, porta TCP, HTTP/HTTPS, scadenza certificato, CPU/RAM/dischi/servizi), allarmi via email, backup ed export cifrato.
- Fase 2 – Gestione: licenze e contratti, fornitori, dashboard, chiavi di licenza open-core.
- Fase 3 – Monitoraggio avanzato: SNMP, storico, rilevamento automatico, mappa infrastruttura.
- Fase 4 – Compliance e AI: report NIS2/GDPR, change management, API pubblica, assistente AI (mai sul vault).
- Fase 5 – Cloud e vendita.

Lavora una fase alla volta e un modulo alla volta. Non anticipare funzioni di fasi successive.

## Fuori ambito per ora

Ticketing, onboarding/offboarding dipendenti, SSO/LDAP, accesso per utenti finali, multi-tenant, agent sui PC client, alert diversi dall'email.
