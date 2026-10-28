# ADR 0001 – Autenticazione, MFA e sessioni

Data: 2026-10-29 · Stato: accettata

## Contesto

Fase 0 richiede login con password e MFA TOTP obbligatoria. In Fase 1 arriverà il vault
zero-knowledge, che secondo CLAUDE.md deriva dalla master password due chiavi distinte: una
per l'autenticazione e una per la cifratura.

## Decisioni

1. **Una sola password, mai inviata al server.** Il browser esegue Argon2id
   (`crypto_pwhash`, 3 passaggi, 64 MiB, salt casuale per utente) e divide l'output di 64 byte
   in `authKey` (inviata) e `encryptionKey` (resta nel browser, servirà al vault). Il server
   salva solo un hash Argon2id dell'`authKey`. I parametri KDF sono salvati per utente e
   validati con dei minimi (2 passaggi, 19 MiB), così si potranno alzare in futuro.
2. **Prelogin senza enumerazione.** `POST /auth/prelogin` restituisce salt e parametri. Per
   utenti inesistenti restituisce un salt finto stabile (BLAKE2b con chiave derivata da
   `SECRET_KEY`).
3. **Sessioni su PostgreSQL**, non JWT. Token opaco casuale di 32 byte in un cookie
   `HttpOnly; Secure; SameSite=Strict`; nel DB c'è solo il suo digest BLAKE2b. Scadenza per
   inattività (30 min) e assoluta (12 h), configurabili. Le sessioni in attesa di MFA durano
   10 minuti e possono raggiungere solo le rotte MFA. Dopo la MFA il token viene ruotato.
4. **MFA TOTP obbligatoria** (RFC 6238, libreria `otpauth`). Il segreto (160 bit da libsodium)
   è cifrato a riposo con XChaCha20-Poly1305 usando una sottochiave di `SECRET_KEY` e l'id
   utente come dato associato. I codici già usati vengono rifiutati (ultimo time step salvato).
   Alla conferma vengono generati 10 codici di backup monouso, mostrati una sola volta e
   salvati come digest.
5. **Protezione brute-force su DB** (nessuna dipendenza aggiuntiva): 20 fallimenti per IP in
   15 minuti portano a una risposta 429; 5 fallimenti per account (password o MFA) portano a
   un blocco di 15 minuti. Le risposte d'errore sono identiche per utente inesistente e
   password errata.
6. **Primo amministratore tramite wizard.** `POST /auth/setup` funziona solo finché non
   esistono utenti; le richieste concorrenti sono serializzate con un advisory lock.
7. **Audit log append-only** imposto da trigger PostgreSQL (UPDATE, DELETE e TRUNCATE
   rifiutati). La conservazione a 30 giorni della Community richiederà un meccanismo
   dedicato, da decidere con un ADR futuro.

## Primitive crittografiche

Tutte da libsodium, tramite `packages/crypto`: Argon2id, XChaCha20-Poly1305 e, in aggiunta a
quelle elencate in CLAUDE.md, **BLAKE2b (`crypto_generichash`)**, usato per i digest di
token e codici di backup, la derivazione delle sottochiavi del server e i salt finti. HMAC-SHA1
per il TOTP è imposto dallo standard e viene calcolato da `otpauth`.

## Conseguenze

- `SECRET_KEY` (32 byte, base64url) è obbligatoria in produzione. Se va persa, i segreti TOTP
  diventano illeggibili e tutti gli utenti devono ripetere la configurazione della MFA.
- Il server non può applicare regole sulla password; la lunghezza minima (12 caratteri) è
  controllata nel browser.
- Il QR code per l'app di autenticazione non c'è ancora: si inserisce la chiave a mano oppure
  si usa l'URI `otpauth://`.
