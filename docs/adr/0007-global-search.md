# ADR 0007 – Ricerca globale

Data: 2026-10-29 · Stato: accettata

## Contesto

L'IT manager deve trovare in pochi secondi un elemento partendo da quello che ha in mano: un
nome, un hostname, un IP letto in un log, un numero di serie su un'etichetta. Oggi gli
elementi sono asset e aree; credenziali, procedure, fornitori e licenze arriveranno dopo.

## Decisioni

1. **Un endpoint, un gruppo di risultati per tipo**: `GET /search?q&limit` risponde
   `{ assets, areas }`, ognuno con i risultati migliori (al massimo `limit`, default 10,
   massimo 50) e il totale. Un nuovo modulo aggiunge il suo gruppo a `SearchService`.
2. **PostgreSQL con `ILIKE`, nessun motore di ricerca esterno né estensione.** I caratteri
   jolly (`%`, `_`) nel testo cercato vengono trattati alla lettera. Per i volumi di una
   singola azienda (migliaia di asset) basta. Se diventerà lento, il passo successivo è
   l'estensione `pg_trgm` con indici GIN, senza cambiare l'API.
3. **Dove si cerca:**
   - negli asset: nome, hostname, IP, numero di serie, produttore, modello, posizione, note e
     valori dei campi personalizzati;
   - nelle aree: nome e descrizione.
4. **Ordine:** prima il nome identico, poi i nomi che iniziano con il testo, poi gli altri,
   in ordine alfabetico. Ogni asset trovato per un campo diverso dal nome indica quel campo
   ("Hostname: dc01.azienda.local"); i testi lunghi vengono accorciati attorno alla
   corrispondenza.
5. **Permessi:** ogni gruppo usa la stessa regola del proprio elenco
   (`AreaAccessService.readableAreas`): un tecnico trova solo ciò che sta nelle sue aree, e
   anche i totali contano solo quello.
6. **Niente audit delle ricerche:** non mostrano nulla in più degli elenchi, e il testo
   cercato potrebbe contenere dati che non vanno conservati. Quando arriverà il vault, le
   credenziali saranno cercabili solo per nome e metadati in chiaro, mai per il contenuto
   cifrato (che il server non conosce).
7. **Interfaccia:** un campo di ricerca nell'intestazione di ogni pagina (si attiva con `/`)
   apre `/search?q=…` con i risultati raggruppati; "Mostra altri risultati" porta il limite a 50.

## Conseguenze

- Almeno 2 caratteri: ricerche di un solo carattere restituirebbero quasi tutto.
- Nessuna tolleranza agli errori di battitura e nessuna ricerca per parole separate: "dc01
  sede" cerca il testo intero.
