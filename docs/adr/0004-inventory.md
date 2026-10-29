# ADR 0004 – Inventario: tipi di asset, campi personalizzati e permessi

Data: 2026-10-29 · Stato: accettata

## Contesto

L'inventario base della Fase 0 deve contenere asset di tipo diverso (server, apparati di rete,
storage…) con campi diversi a seconda del tipo. Ogni asset appartiene a un'area e ne eredita i
permessi (ADR 0003).

## Decisioni

1. **I tipi di asset sono globali**, non legati a un'area. Tutti i ruoli li leggono; solo
   l'amministratore li crea, li modifica e li elimina. La migrazione crea alcuni tipi
   predefiniti (Server, Dispositivo di rete, Storage, Stampante, Altro), modificabili.
2. **Campi comuni come colonne, campi personalizzati in JSONB.** Nome, stato, hostname, IP,
   numero di serie, produttore, modello, posizione e note sono colonne, così filtri e ricerca
   restano semplici. I campi del tipo sono definiti in `asset_types.fields` (JSONB) e i valori in
   `assets.custom_fields` (JSONB), indicizzati per chiave. Tipi di campo: testo, numero, data,
   sì/no, elenco di scelta. Niente modello EAV: le query restano leggibili e l'import CSV potrà
   mappare le colonne direttamente.
3. **Un'unica funzione di validazione** (`validateCustomFields` in `packages/shared`), usata
   dall'API e dal browser. Il server rifiuta chiavi sconosciute, tipi errati e campi
   obbligatori mancanti; i valori vuoti vengono eliminati.
4. **Modificare un tipo non riscrive gli asset.** I valori dei campi rimossi o cambiati restano
   salvati ma non vengono restituiti finché non tornano validi. I nuovi campi obbligatori si
   applicano al salvataggio successivo di ogni asset. Nell'interfaccia la chiave di un campo già
   salvato non è modificabile, perché i valori sono archiviati sotto quella chiave.
5. **Permessi ereditati dall'area**, controllati in `AssetsService` tramite `AreaAccessService`:
   `read` per vedere, `write` per creare, modificare ed eliminare. Spostare un asset richiede
   `write` su entrambe le aree. Un asset in un'area non visibile risponde 404. L'elenco filtra
   sempre per le aree dell'utente, qualunque filtro venga passato.
6. **Eliminazione protetta:** le chiavi esterne verso aree e tipi sono `ON DELETE RESTRICT`.
   Un'area o un tipo che contengono asset non si possono eliminare (409). PostgreSQL segnala
   questo caso con `restrict_violation` (23001), non con `foreign_key_violation` (23503):
   l'API li tratta allo stesso modo.
7. **Audit** per creazione, modifica (con l'elenco dei campi cambiati, mai i valori), spostamento
   ed eliminazione di asset e tipi. La sola consultazione di un asset non viene registrata:
   l'audit della lettura è riservato alle credenziali (Fase 1).
8. **Elenco paginato** (`limit` fino a 200, `offset`) con ricerca semplice su nome, hostname, IP
   e numero di serie. La ricerca globale tra tutti gli elementi è un modulo separato.

## Conseguenze

- I filtri sui campi personalizzati non sono ancora supportati; quando serviranno si potrà
  aggiungere un indice GIN su `custom_fields`.
- L'IP è un solo indirizzo in formato testo validato. Più interfacce per asset arriveranno, se
  necessario, con il modello delle relazioni o con un campo dedicato.
