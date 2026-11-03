# ADR 0008 – Niente vault delle password

Data: 2026-11-03 · Stato: accettata

## Contesto

La roadmap prevedeva in Fase 1 un vault zero-knowledge per le credenziali dei sistemi gestiti
(chiavi d'area cifrate per ogni membro, rotazione alla revoca, chiave di recupero). Dopo
averlo progettato e realizzato, il proprietario del prodotto ha deciso di non includerlo:
PlanciaIT non conserva le password dei sistemi gestiti.

## Decisioni

1. **Nessun vault.** Niente credenziali, chiavi d'area, coppie di chiavi utente né chiave di
   recupero. Il lavoro fatto è stato scartato prima di essere pubblicato.
2. **L'accesso resta quello della Fase 0** (ADR 0001, 0002): nome utente, password e MFA TOTP
   obbligatoria con codici di backup. Il browser deriva dalla password, con Argon2id, la
   chiave di autenticazione; il server ne salva solo un hash. La `encryptionKey` derivata
   insieme non ha più un uso.
3. **Il reset delle credenziali di accesso è solo dell'amministratore:** "Reimposta accesso"
   (nuovo link d'invito: elimina password, MFA e codici di backup) e "Reimposta MFA". Entrambi
   terminano le sessioni dell'utente e finiscono nell'audit log. Nessun recupero self-service.
4. Nell'interfaccia la password di accesso si chiama "password", non più "master password".

## Conseguenze

- CLAUDE.md non contiene più le regole del vault; restano quelle sulla password di accesso e
  sulla crittografia in `packages/crypto`.
- I riferimenti al vault negli ADR 0001–0004 e 0007 descrivono piani superati da questo ADR.
