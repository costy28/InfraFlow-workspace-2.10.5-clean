# UPDATE 635 — Serviciu central de actualizări

**Versiune:** `2.12.615`  
**Data:** `2026-10-02`

## Livrat

- Serviciu separat `infraflow-updates` pentru catalogul central semnat și arhivele de update.
- Instalare Linux prin systemd, cu ascultare exclusiv pe `127.0.0.1:4182` și publicare prevăzută numai prin Cloudflare Tunnel.
- Arhivă dedicată de instalare pentru serviciul central.
- Endpointurile servesc doar catalogul, pachetele din directorul permis și health check; fără listare directoare sau scriere HTTP.
- Pachetele pot fi protejate cu token transmis numai în header `Authorization`.

## Limită intenționată

Nu este activată încă descărcarea automată cu ticket temporar per licență. Nu se publică module separat pentru clienți neeligibili până la acea etapă. Update-ul manual actual rămâne complet funcțional.
