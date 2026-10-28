# ADR 0002 – Creazione utenti tramite invito

Data: 2026-10-29 · Stato: accettata

## Contesto

Con il modello zero-knowledge (ADR 0001) la chiave di autenticazione si deriva dalla master
password solo nel browser di chi la conosce. L'amministratore quindi non può impostare né
reimpostare la password di un altro utente.

## Decisioni

1. **Gli utenti si creano con un invito.** L'amministratore indica nome utente, nome
   visualizzato e ruolo. Il server crea l'account senza credenziali e restituisce **una sola
   volta** un token casuale di 32 byte, valido 72 ore; nel DB ne salva solo il digest.
2. **Il link è `/invite#<token>`.** Il token sta nel frammento dell'URL, che il browser non
   invia mai al server: non finisce nei log del proxy né nell'header Referer. La pagina lo
   rimuove dalla barra degli indirizzi appena lo legge e lo invia nel corpo di una POST.
3. **Accettazione:** l'utente invitato sceglie la master password e il browser invia solo
   l'auth key derivata, come nella configurazione iniziale. Subito dopo segue la
   configurazione obbligatoria della MFA. L'invito si consuma con un UPDATE condizionato sul
   token, quindi due accettazioni concorrenti non possono riuscire entrambe.
4. **Reimpostazione dell'accesso = nuovo invito.** Elimina master password, MFA e codici di
   backup e termina tutte le sessioni. È l'unico rimedio a una master password dimenticata.
   Dalla Fase 1 l'utente perderà la propria chiave privata; l'amministratore dovrà
   ricondividergli le chiavi delle aree.
5. **Gli utenti non si eliminano, si disattivano.** La disattivazione termina subito tutte le
   sessioni. L'audit log conserva gli id storici.
6. **Nessuna auto-modifica pericolosa.** Un amministratore non può cambiare il proprio ruolo,
   disattivarsi né reimpostare il proprio accesso o la propria MFA. Ne consegue che resta
   sempre almeno un amministratore attivo.
7. **Il ruolo si legge dal DB a ogni richiesta**, quindi un cambio di ruolo ha effetto
   immediato sulle sessioni aperte.

## Conseguenze

- Finché non c'è l'SMTP (Fase 1), l'amministratore copia il link e lo consegna su un canale
  sicuro.
- Il limite Community di 3 utenti non viene ancora applicato: arriverà con le chiavi di
  licenza (Fase 2).
