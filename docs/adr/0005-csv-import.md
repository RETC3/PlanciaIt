# ADR 0005 – Import CSV degli asset

Data: 2026-10-29 · Stato: accettata

## Contesto

Chi adotta PlanciaIT ha quasi sempre un inventario esistente in un foglio Excel. Serve un
modo per caricarlo senza inserire gli asset uno per uno, rispettando le stesse regole di
validazione e di permesso del form.

## Decisioni

1. **Il CSV si legge nel browser.** Un piccolo parser RFC 4180 in `apps/web/src/lib/csv.ts`
   (nessuna nuova dipendenza) riconosce il separatore (`;`, `,` o tab), le virgolette, gli a capo
   nei campi e il BOM degli export di Excel. Il server riceve righe JSON già abbinate ai campi:
   niente upload di file né parsing lato server.
2. **Abbinamento delle colonne** automatico per chiave, etichetta italiana o sinonimi comuni
   (IP, S/N, matricola…), modificabile a mano. I valori in formato italiano vengono convertiti:
   numeri con la virgola, sì/no, date `GG/MM/AAAA`, stato scritto per esteso.
3. **Anteprima con le stesse regole dell'API** (`importAssetRowSchema` e
   `validateCustomFields` da `packages/shared`). Le righe con errori vengono mostrate con i campi
   da correggere e, previa conferma, saltate: al server arrivano solo le righe valide.
4. **`POST /assets/import` è tutto o niente.** Il server ricontrolla ogni riga; se anche una
   sola non è valida rifiuta l'intera richiesta, indicando riga e campo (`assets.<n>.…`).
   Altrimenti inserisce tutto in un'unica transazione. Un import riguarda una sola area (dove
   serve il permesso `write`) e un solo tipo, al massimo 1000 righe.
5. **Audit:** una riga `asset.created` per ogni asset (con `imported: true`) più una riga
   riassuntiva `asset.imported` sull'area, scritte in un'unica istruzione nella stessa
   transazione.
6. **Limite del corpo JSON portato a 2 MB** (da 100 KB, il valore predefinito di Express),
   configurato in `common/http-setup.ts` e condiviso tra server e test. Numero di righe e
   lunghezza dei campi restano limitati dagli schemi zod.

## Conseguenze

- Per file con più di 1000 righe o con asset di tipi diversi servono più import; si potrà
  aggiungere una colonna "tipo" se diventa un'esigenza reale.
- Nessuna deduplicazione: importare due volte lo stesso file crea doppioni. La ricerca e,
  in seguito, il rilevamento automatico aiuteranno a individuarli.
