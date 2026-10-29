# ADR 0003 – Aree e permessi

Data: 2026-10-29 · Stato: accettata

## Contesto

Ogni elemento (asset, credenziale, procedura…) appartiene a un'area e ne eredita i permessi.
L'amministratore vede tutto; i tecnici solo le aree assegnate, con permesso `read` o `write`.
Il controllo va sempre fatto lato server, su ogni endpoint.

## Decisioni

1. **Due tabelle:** `areas` (nome unico senza distinzione tra maiuscole e minuscole,
   descrizione facoltativa) e `area_members` (area, utente, permesso), con chiave primaria
   sulla coppia area–utente.
2. **Gli amministratori non sono membri.** Hanno `write` su ogni area per ruolo. Solo i tecnici
   possono essere assegnati. Quando un tecnico viene promosso ad amministratore, le sue
   assegnazioni vengono eliminate: una retrocessione successiva riparte da zero e non
   ripristina accessi dimenticati.
3. **Un solo punto di decisione:** `AreaAccessService` calcola il permesso di un utente su
   un'area. La guardia globale lo usa per le rotte marcate con
   `@AreaAccess(permesso, parametro)`. I servizi che caricano prima un elemento e poi ne
   controllano l'area (a partire dall'inventario, prossimo modulo della Fase 0) chiamano lo stesso servizio.
4. **Un'area non visibile risponde 404**, come un'area inesistente, così non se ne rivela
   l'esistenza. Chi ha solo `read` e tenta una scrittura riceve 403.
5. **Solo gli amministratori gestiscono aree e assegnazioni.** `GET /areas` è aperto a tutti
   i ruoli, ma restituisce solo le aree dell'utente. Permessi e ruolo si leggono dal DB a ogni
   richiesta, quindi ogni modifica ha effetto immediato.
6. **Audit:** creazione, modifica, eliminazione, aggiunta e rimozione di un membro e cambio
   di permesso scrivono una riga ciascuna. Riassegnare lo stesso permesso non è una modifica
   e non viene registrato.
7. **L'eliminazione di un'area** rimuove le assegnazioni (cascade). Quando arriveranno gli
   elementi, le loro chiavi esterne useranno `ON DELETE RESTRICT`: un'area non vuota non si
   potrà eliminare e l'API risponderà 409.

## Conseguenze

- In Fase 1 ogni area avrà una chiave simmetrica cifrata per ogni membro (CLAUDE.md). Aggiunta
  e rimozione di un membro dovranno allora distribuire o ruotare quella chiave, e anche gli
  amministratori ne avranno bisogno di una copia: la regola "gli amministratori non sono
  membri" andrà rivista per la parte crittografica, non per i permessi.
