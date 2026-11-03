# ADR 0009 – Documentazione: procedure e knowledge base

Data: 2026-11-03 · Stato: proposta

## Contesto

La Fase 1 prevede procedure e knowledge base: il team IT scrive come si fa una cosa ("rinnovo
del certificato del firewall") e cosa sa di un sistema ("perché il NAS si blocca dopo gli
aggiornamenti"). Ogni testo cambia nel tempo, e serve sapere chi ha cambiato cosa e poter
tornare indietro. Servono screenshot e file allegati.

## Decisioni

1. **Un solo elemento, il documento**, con un tipo fisso: `procedure` (Procedura) o
   `article` (Articolo). Una sola voce di menu, "Documentazione", con un filtro per tipo.
   Come ogni elemento appartiene a un'area e ne eredita i permessi: chi legge l'area legge i
   suoi documenti, chi ci scrive li crea, modifica, sposta ed elimina. Spostare un documento
   richiede la scrittura su entrambe le aree.
2. **Editor Tiptap, contenuto salvato come JSON di Tiptap**, mai come HTML. Il server
   valida il JSON con uno schema zod in `packages/shared` che ammette solo i nodi e i
   segni dell'editor (paragrafi, titoli, elenchi, checklist, citazioni, codice, righe,
   immagini, grassetto, corsivo, barrato, codice in linea, link), con link solo `http`,
   `https` e `mailto`, immagini solo da allegati dello stesso documento e un limite di
   dimensione (1 MB di JSON). La lettura usa Tiptap in sola lettura: nessun HTML scritto da
   utenti arriva al browser, quindi niente XSS dai contenuti. Il server ricava dal JSON il
   testo semplice, che serve alla ricerca e al confronto.
3. **Versioni immutabili.** `documents` contiene lo stato attuale (titolo, tipo, contenuto,
   testo, numero di versione); `document_versions` ne conserva una copia per ogni
   salvataggio, con autore, data e una nota facoltativa ("aggiornato l'IP del server"). Le
   versioni non si modificano e non si cancellano, se non insieme al documento. Spostare il
   documento o cambiarne il tipo non crea una versione: il contenuto non cambia.
4. **Modifiche concorrenti:** ogni salvataggio dichiara la versione da cui parte; se nel
   frattempo qualcun altro ha salvato, il server risponde 409 e l'interfaccia lo segnala
   senza perdere il testo scritto.
5. **Ripristino** di una versione vecchia = nuova versione con quel titolo e contenuto, e
   nota "Ripristinata la versione N". Lo storico resta intatto.
6. **Confronto tra due versioni qualsiasi, nel browser**, sul testo semplice diviso in
   blocchi (un paragrafo, titolo o voce d'elenco per riga): righe aggiunte in verde, tolte
   in rosso, uguali in grigio. L'algoritmo (LCS sulle righe) è scritto da noi, senza
   dipendenze. Le differenze solo di formattazione non vengono mostrate.
7. **Allegati salvati in PostgreSQL** (`bytea` in `document_attachments`), non su disco:
   - un unico backup copre tutto, i file seguono i permessi e la cancellazione del
     documento nella stessa transazione, e Docker non richiede un volume in più;
   - limiti: 10 MB per file, 100 MB per documento;
   - tipi ammessi: immagini PNG, JPEG, GIF, WebP (mostrabili nel testo), PDF, testo, CSV,
     ZIP e documenti Office. Il tipo si verifica dai primi byte del file, non dal nome. SVG
     e HTML non sono ammessi;
   - il download risponde con `Content-Disposition: attachment` (inline solo per le
     immagini ammesse), `X-Content-Type-Options: nosniff` e una CSP `sandbox`;
   - l'upload usa multer, già incluso in `@nestjs/platform-express`;
   - gli allegati non hanno versioni: eliminarne uno lo toglie anche dalle versioni vecchie,
     che mostrano al suo posto "allegato eliminato". Non si può eliminare un allegato usato
     nella versione attuale.
8. **Audit:** `document.created`, `document.updated` (con il numero di versione),
   `document.restored`, `document.moved`, `document.deleted`, `document.attachment_added`,
   `document.attachment_deleted`. La lettura non si registra: i documenti non contengono
   segreti, e non devono contenerne (l'interfaccia lo ricorda nell'editor).
9. **Relazioni e ricerca:** `document` diventa un tipo di elemento delle relazioni (ADR
   0006), così una procedura si collega agli asset che descrive; la pagina dell'asset
   mostra i documenti collegati nella sezione "Collegamenti". La ricerca globale (ADR 0007)
   aggiunge il gruppo "Documentazione" su titolo e testo.
10. **API:** `GET/POST /documents`, `GET/PATCH/DELETE /documents/:id`,
    `GET /documents/:id/versions`, `GET /documents/:id/versions/:n`,
    `POST /documents/:id/versions/:n/restore`, `GET/POST /documents/:id/attachments`,
    `GET/DELETE /documents/:id/attachments/:attachmentId`.

## Conseguenze

- Nuove dipendenze nel frontend, approvate: `@tiptap/react`, `@tiptap/pm`,
  `@tiptap/starter-kit` e le estensioni per immagini e checklist.
- Il database cresce con gli allegati: il backup della Fase 1 dovrà tenerne conto.
- Il limite del corpo JSON dell'API si alza solo per le rotte dei documenti.
- Niente modifica collaborativa in tempo reale: due persone sulla stessa pagina se ne
  accorgono al salvataggio (punto 4).
