# Setup: Self-Hosted GitHub Actions Runner su Oracle Cloud

Guida per configurare un runner gratuito e always-on che esegue i test di
qualita del Knowledge Graph usando Claude CLI con il tuo abbonamento Pro.

## Prerequisiti

- Account GitHub con accesso admin al repository
- Account Oracle Cloud (registrazione gratuita su cloud.oracle.com)
- Abbonamento Claude Pro attivo

---

## 1. Creare la VM su Oracle Cloud Free Tier

1. Accedi a **cloud.oracle.com** > crea un account (richiede carta di credito
   per verifica, ma il Free Tier non addebita nulla)

2. Vai su **Compute > Instances > Create Instance**

3. Configura:
   - **Name**: `orbis-ci-runner`
   - **Image**: Ubuntu 24.04 (Canonical)
   - **Shape**: VM.Standard.A1.Flex (ARM) — **1 OCPU, 6 GB RAM** (gratuito)
   - **Networking**: crea una VCN con subnet pubblica (default va bene)
   - **SSH key**: carica la tua chiave pubblica (`~/.ssh/id_rsa.pub` o
     `~/.ssh/id_ed25519.pub`)

4. Clicca **Create** e attendi che lo stato diventi **Running**

5. Copia l'**IP pubblico** dalla dashboard

---

## 2. Configurare la VM

Connettiti via SSH:

```bash
ssh ubuntu@<IP_PUBBLICO>
```

### 2a. Installare le dipendenze di sistema

```bash
sudo apt update && sudo apt install -y \
  python3 python3-pip python3-venv \
  nodejs npm \
  git
```

### 2b. Installare Claude CLI

```bash
sudo npm install -g @anthropic-ai/claude-code
```

### 2c. Login Claude CLI

Questo e il passaggio chiave. Dalla VM, esegui:

```bash
claude login
```

Il CLI mostrera un URL del tipo:

```
Please open this URL in your browser: https://auth.anthropic.com/...
```

**Copia l'URL e aprilo nel browser del tuo computer locale** (non serve un
browser sulla VM). Autorizza l'accesso con il tuo account Claude Pro. Dopo
l'autorizzazione, il CLI sulla VM conferma il login.

Verifica che funzioni:

```bash
claude -p "Rispondi solo OK"
```

### 2d. Installare le dipendenze Python del progetto

```bash
cd ~
git clone https://github.com/<TUO_USER>/orb_project.git
cd orb_project/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

---

## 3. Installare il GitHub Actions Runner

### 3a. Creare il runner su GitHub

1. Vai su **GitHub > repository > Settings > Actions > Runners**
2. Clicca **New self-hosted runner**
3. Seleziona **Linux** e **ARM64**
4. GitHub mostra i comandi da copiare. Eseguili sulla VM:

```bash
cd ~
mkdir actions-runner && cd actions-runner

# Scarica (GitHub ti da l'URL esatto con il token)
curl -o actions-runner-linux-arm64-X.Y.Z.tar.gz -L <URL_DA_GITHUB>
tar xzf actions-runner-linux-arm64-X.Y.Z.tar.gz

# Configura
./config.sh --url https://github.com/<TUO_USER>/orb_project --token <TOKEN_DA_GITHUB>
```

Quando chiede il nome, usa `orbis-ci-runner`. Per le label, lascia i default.

### 3b. Installare come servizio (auto-start al boot)

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

### 3c. Verificare

```bash
sudo ./svc.sh status
```

Deve mostrare **active (running)**. Su GitHub, il runner appare come
**Idle** in Settings > Actions > Runners.

---

## 4. Verificare il flusso completo

Crea un branch di test, modifica un file in `backend/app/cv/` o
`backend/tests/`, e apri una PR. Il workflow "KG Quality Gate" dovrebbe:

1. Partire automaticamente sul runner self-hosted
2. Eseguire il test con Claude CLI (usando il tuo abbonamento Pro)
3. Postare i risultati come commento sulla PR

---

## Manutenzione

### Token di login scaduto

Se il login Claude scade, riconnettiti alla VM e rifai il login:

```bash
ssh ubuntu@<IP_PUBBLICO>
claude login
```

### Aggiornare Claude CLI

```bash
ssh ubuntu@<IP_PUBBLICO>
sudo npm update -g @anthropic-ai/claude-code
```

### Aggiornare il runner

GitHub notifica quando serve un aggiornamento. Il runner si aggiorna
automaticamente nella maggior parte dei casi. Se non riesce:

```bash
ssh ubuntu@<IP_PUBBLICO>
cd ~/actions-runner
sudo ./svc.sh stop
# Riscarica la nuova versione da GitHub
sudo ./svc.sh start
```

### Costi

| Risorsa | Costo |
|---------|-------|
| Oracle Cloud VM (A1.Flex 1 OCPU / 6GB) | Gratuito (Free Tier permanente) |
| Claude CLI via abbonamento Pro | Incluso nel tuo piano |
| GitHub Actions self-hosted runner | Gratuito |
| **Totale** | **$0/mese** |
