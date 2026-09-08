# A-light — CLI Integration Report (2026-09-02)

> Three runs via stub-gateway A-light on 4000 + Go stubs on 4100/4101, postgres via docker pgvector:pg16

## Runs
- **run-01**: p50=732 p95=846 | health: `{"status":"ok","service":"stub-gateway","artifact":"A-light","uptime":147.277860`
- **run-02**: p50=705 p95=766 | health: `{"status":"ok","service":"stub-gateway","artifact":"A-light","uptime":186.002235`
- **run-03**: p50=713 p95=813 | health: `{"status":"ok","service":"stub-gateway","artifact":"A-light","uptime":201.474757`

## Resource Snapshots (sample run-01)
```
{"BlockIO":"4.1kB / 54MB","CPUPerc":"0.00%","Container":"17fc2d9d6897ad418b70b25e3d3e89a8fe96404caebe050b08e7572b60bf7c20","ID":"17fc2d9d6897","MemPerc":"0.08%","MemUsage":"24.7MiB / 30.84GiB","Name":"trapmap-postgres","NetIO":"8.91kB / 126B","PIDs":"6"}
{"BlockIO":"4.1kB / 54MB","CPUPerc":"0.00%","Container":"17fc2d9d6897ad418b70b25e3d3e89a8fe96404caebe050b08e7572b60bf7c20","ID":"17fc2d9d6897","MemPerc":"0.08%","MemUsage":"24.84MiB / 30.84GiB","Name":"trapmap-postgres","NetIO":"8.91kB / 126B","PIDs":"6"}
```
```
Images space usage:

REPOSITORY          TAG       IMAGE ID       CREATED       SIZE      SHARED SIZE   UNIQUE SIZE   CONTAINERS
pgvector/pgvector   pg16      9b05db12a354   2 weeks ago   438MB     0B            438.4MB       1

Containers space usage:

CONTAINER ID   IMAGE                    COMMAND                  LOCAL VOLUMES   SIZE      CREATED          STATUS                    NAMES
17fc2d9d6897   pgvector/pgvector:pg16   "docker-entrypoint.s…"   1               63B       19 minutes ago   Up 19 minutes (healthy)   trapmap-postgres

Local Volumes space usage:

VOLUME NAME              LINKS     SIZE
trap-map_postgres_data   1         48MB

Build cache usage: 1.283GB

CACHE ID        CACHE TYPE     SIZE      CREATED          LAST USED        USAGE     SHARED
nsadnjbj808p*   regular        3.95MB    27 minutes ago                    0         false
svvoq2e4dxco*   regular        1.24GB    19 minutes ago                    0         false
s6wogjguvokl*   regular        0B        26 minutes ago   26 minutes ago   1         false
74nnamd54w4p*   regular        0B        26 minutes ago   26 minutes ago   1         false
roejogtaqada*   regular        0B        26 minutes ago   26 minutes ago   1         false
6tpad3e4dsro    source.local   4.02MB    24 minutes ago   23 minutes ago   1         false
h8odke3i851b    source.local   443B      24 minutes ago   23 minutes ago   1         false
2mr7e8ruqrv9    source.local   6.96kB    25 minutes ago   23 minutes ago   1         false
d7h20kb03tz6    source.local   7.12kB    27 minutes ago   19 minutes ago   3         false
w1uj2ddtweu6    source.local   443B      27 minutes ago   19 minutes ago   3         false
1h9wymtrjve3    source.local   4.02MB    26 minutes ago   19 minutes ago   2         false
kjseincu6frq    regular        603kB     26 minutes ago   19 minutes ago   1         false
```
```
cat: benchmarks/results/cli-integration/A-light/run-01/host-df.txt: No such file or directory
```

## CLI Timings (run-01)
```jsonl
{"cmd":"about","name":"about","ms":697,"exitCode":0}
{"cmd":"api:list","name":"api-list","ms":647,"exitCode":0}
{"cmd":"search test-trap","name":"search","ms":728,"exitCode":0}
{"cmd":"skill find --json","name":"skill-find","ms":694,"exitCode":0}
{"cmd":"skill search-by-content trap-content","name":"skill-search-by-content","ms":717,"exitCode":0}
{"cmd":"skill find","name":"skill-find-nojson","ms":717,"exitCode":0}
```

## Metrics (Go)
```
# HELP go_goroutines gauge
go_goroutines 5
# HELP go_accel_cache_hits_total counter
go_accel_cache_hits_total 123
```
