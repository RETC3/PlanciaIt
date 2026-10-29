# ADR 0006 – Relazioni tra elementi

Data: 2026-10-29 · Stato: accettata

## Contesto

Il modello dati prevede la **Relazione**: un collegamento generico tra due elementi qualsiasi
("questa VM gira su questo host", "questo server si trova in questo armadio"). Oggi esistono
solo gli asset, ma credenziali, procedure, fornitori e licenze dovranno potersi collegare con
lo stesso meccanismo.

## Decisioni

1. **Una sola tabella `relations` con estremi polimorfici**: `source_type`/`source_id` e
   `target_type`/`target_id`, dove il tipo è l'enum `element_type` (per ora solo `asset`). Un
   nuovo modulo aggiunge un valore all'enum e un caso a `RelationsService.loadElements`.
2. **Niente chiavi esterne sugli estremi**, che sono polimorfici. Un trigger `AFTER DELETE`
   per ogni tabella di elementi (`delete_element_relations`, con il tipo come argomento)
   cancella le relazioni dell'elemento eliminato nella stessa transazione: niente relazioni
   orfane, qualunque sia il codice che elimina.
3. **Tipi di relazione fissi** (`relation_kind`), letti dalla sorgente al destinatario:
   `depends_on`, `runs_on`, `located_in`, `backed_up_to` (orientati) e `connected_to`,
   `related_to` (simmetrici). L'interfaccia mostra le due letture ("Dipende da" / "È
   necessario per"). Tipi personalizzati si potranno aggiungere se serviranno davvero.
4. **Unicità**: indice unico su tipo ed estremi. Le relazioni simmetriche vengono salvate con
   gli estremi in ordine canonico, così "A collegato a B" e "B collegato a A" sono la stessa
   riga. Un elemento non può essere collegato a sé stesso (vincolo `CHECK`).
5. **Permessi ereditati da entrambi gli estremi**:
   - una relazione è visibile solo a chi può leggere **entrambi** gli elementi; le altre
     vengono omesse dall'elenco, senza rivelare che esistono;
   - crearla o eliminarla richiede la lettura di entrambi e la **scrittura su almeno uno**:
     un tecnico può dire che il suo server dipende dal database di un'area che vede in sola
     lettura;
   - un estremo non visibile risponde 404, come gli elementi mancanti.
6. **Le relazioni si creano e si eliminano, non si modificano.** Hanno una nota facoltativa.
   Audit: `relation.created` e `relation.deleted`, con tipo ed estremi. La cancellazione
   automatica dal trigger non scrive righe proprie: è coperta da `asset.deleted`.
7. **API generica**: `GET /relations?elementType&elementId`, `POST /relations`,
   `DELETE /relations/:id`. Nell'interfaccia la sezione "Collegamenti" è un componente
   riusabile (`RelationsCard`), oggi nella pagina dell'asset.

## Conseguenze

- Spostare un asset in un'altra area non tocca le sue relazioni: la visibilità si ricalcola a
  ogni lettura.
- Non ci sono controlli sui cicli (A dipende da B che dipende da A): sono informazioni, non
  vincoli. L'analisi d'impatto e la mappa dell'infrastruttura (Fase 3) partiranno da qui.
- L'elenco delle relazioni di un elemento non è paginato: ci si aspettano decine di
  collegamenti, non migliaia.
