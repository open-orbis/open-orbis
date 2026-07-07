# Sostituire Cloud Tasks con un worker locale sul VPS

> **✅ IMPLEMENTATO il 2026-07-07** — vedi `app/cv/worker.py`,
> `jobs_db.claim_next_queued_job` / `requeue_orphaned_running_jobs` e il
> lifespan in `app/main.py`. Questo documento resta come motivazione storica
> della scelta. Scritto durante il cutover OVH+Cloudflare del 2026-07-05.

## Perché Cloud Tasks esiste (e perché non serve più)

Su Cloud Run i container possono essere terminati in qualsiasi momento, quindi
l'elaborazione CV (fino a ~20 min di chiamate LLM) non poteva vivere nel processo
che riceve l'upload. Il flusso attuale:

1. `POST /api/cv/upload` crea il job in Postgres (`status="queued"`, `app/cv/jobs_db.py`)
2. `dispatch_cv_job()` (`app/cv/cloud_tasks.py`) accoda un task su Cloud Tasks
3. GCP richiama `POST /api/cv/process-job` (OIDC verificato in `jobs_router.py`)
   che porta il job `queued → running → succeeded|failed`
4. La cancellazione (`cancel_cv_job()`) cancella il task GCP; l'endpoint admin
   aggiorna anche lo stato in Postgres

Su un VPS il processo è sempre attivo: la coda esterna è solo un giro
VPS → Google → VPS con OIDC in mezzo. Lo stato del job è **già** interamente in
Postgres — Cloud Tasks fa solo da "timer con retry".

## Architettura sostitutiva consigliata: worker loop in-process

Un task asyncio avviato nel lifespan di FastAPI che fa polling su Postgres.
Robusto ai riavvii (i job `queued` ripartono da soli), zero infrastruttura nuova,
zero nuovi processi nel compose.

```
upload → INSERT job (queued) → [worker loop: SELECT ... FOR UPDATE SKIP LOCKED]
       → esegue la stessa logica di process_job() → succeeded/failed
```

### Passi

1. **Estrarre la logica di elaborazione** da `process_job()` in
   `app/cv/jobs_router.py` in una funzione pura
   `async def run_cv_job(job_id: str) -> None` (stesso file o `app/cv/runner.py`):
   tutto ciò che sta dopo la verifica OIDC — transizione `queued→running`,
   estrazione, `_persist_nodes`, email di esito.

2. **Aggiungere il worker loop** (es. `app/cv/worker.py`):

   ```python
   POLL_SECONDS = 3

   async def cv_worker_loop() -> None:
       while True:
           job_id = await jobs_db.claim_next_queued_job()  # nuova query
           if job_id is None:
               await asyncio.sleep(POLL_SECONDS)
               continue
           try:
               await run_cv_job(job_id)
           except Exception:
               logger.exception("CV job %s crashed", job_id)
   ```

   `claim_next_queued_job()` in `jobs_db.py`:

   ```sql
   UPDATE cv_jobs SET status = 'running', started_at = now()
   WHERE id = (
     SELECT id FROM cv_jobs WHERE status = 'queued'
     ORDER BY created_at LIMIT 1
     FOR UPDATE SKIP LOCKED
   )
   RETURNING id;
   ```

   `FOR UPDATE SKIP LOCKED` rende il claim sicuro anche con più worker/repliche.

3. **Avviare il loop** nel lifespan di `app/main.py` (dove già si inizializza la
   tabella `cv_jobs`): `asyncio.create_task(cv_worker_loop())`, con cancel nel
   teardown.

4. **Sostituire dispatch e cancel:**
   - `dispatch_cv_job()` → non serve più: l'upload lascia il job `queued` e il
     worker lo raccoglie entro pochi secondi. Rimuovere la chiamata e il campo
     con il task name se salvato.
   - `cancel_cv_job()` → diventa un flag: `UPDATE cv_jobs SET status='cancelled'
     WHERE id=%s AND status='queued'`. Per i job già `running`, aggiungere un
     check cooperativo dello stato nei punti di progresso di `run_cv_job`
     (dove oggi c'è `_progress_cb`) che solleva un'eccezione di cancellazione.

5. **Ripristino dei job orfani al boot:** all'avvio, riportare a `queued` i job
   rimasti `running` da un crash/deploy:
   `UPDATE cv_jobs SET status='queued' WHERE status='running'`.
   (Con un solo processo backend è sicuro; farlo prima di avviare il loop.)

6. **Pulizia:**
   - Eliminare `app/cv/cloud_tasks.py` e l'endpoint `POST /api/cv/process-job`
     (con la verifica OIDC) da `jobs_router.py`
   - Rimuovere da `config.py`: `cloud_tasks_queue`, `cloud_tasks_location`,
     `cloud_run_service_account`; valutare se `cloud_run_url` serve ancora
     (il servizio MCP lo usa per l'URL pubblico — rinominarlo se si tiene)
   - Rimuovere `google-cloud-tasks` da `pyproject.toml`
   - `infra/ovh/docker-compose.prod.yml`: rimuovere `CLOUD_RUN_URL` dal backend
   - `infra/ovh/Caddyfile` + DNS Cloudflare: eliminare `tasks.open-orbis.com`
     (esisteva solo per far bypassare al callback il limite ~100 s del proxy)
   - Su GCP: eliminare la coda Cloud Tasks; il service account resta per Vertex
   - Aggiornare i test unit che mockano `cloud_tasks` e i docs
     (`docs/architecture.md`, `docs/api.md`, `docs/deployment.md`)

## Alternative scartate

- **FastAPI `BackgroundTasks`**: lega il job al ciclo di vita della richiesta e
  non sopravvive ai riavvii; nessun claim transazionale.
- **Coda dedicata (Redis/RQ, Celery, ARQ)**: aggiunge un servizio e una
  dipendenza per un carico che è "pochi job al giorno, uno alla volta".
  Giustificata solo se i job CV diventano molti e paralleli.

## Test di collaudo

1. Upload CV → job passa `queued → running → succeeded` senza chiamate esterne
   (verificare nei log l'assenza di dispatch Cloud Tasks)
2. Riavvio del backend con un job `running` → il job riparte e completa
3. Cancellazione da admin di un job `queued` e di uno `running`
4. Email di esito ancora inviate
